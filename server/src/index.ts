import cors from 'cors';
import express from 'express';
import type { V1Binding, V1Node, V1Pod, V1PodList } from '@kubernetes/client-node';
import { z } from 'zod';
import { config } from './config.js';
import { addEventClient, broadcast, removeEventClient, sendEvent } from './events.js';
import { createK8sClients } from './k8sClient.js';
import { buildSnapshot } from './snapshot.js';
import { decideTargetNode } from './scheduler.js';
import type { K8sSnapshot, SchedulerStrategy, Task } from './types.js';

const app = express();
const clients = createK8sClients();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const decisionSchema = z.object({
  task: z.custom<Task>(),
  nodes: z.array(z.any()).optional(),
  strategy: z.enum(['LeastRequested', 'MostRequested']).default('LeastRequested'),
});

const bindingSchema = z.object({
  task: z.custom<Task>(),
  targetNodeId: z.string().min(1),
  score: z.number().optional(),
  strategy: z.enum(['LeastRequested', 'MostRequested']).default('LeastRequested'),
});

const deletePodSchema = z.object({
  taskId: z.string().min(1),
});

const burstSchema = z.object({
  count: z.number().int().min(1).max(config.testPodCountLimit).default(10),
});

function unwrap<T>(result: T | { body: T }) {
  if (result && typeof result === 'object' && 'body' in result) {
    return (result as { body: T }).body;
  }

  return result as T;
}

function splitTaskId(taskId: string) {
  const [namespace, name] = taskId.split('/');

  if (!namespace || !name) {
    throw new Error(`taskId 必须使用 namespace/name 格式: ${taskId}`);
  }

  if (namespace !== config.namespace) {
    throw new Error(`只允许操作 ${config.namespace} namespace 内的 Pod`);
  }

  return { namespace, name };
}

async function callCore<T>(methodName: string, ...args: unknown[]): Promise<T> {
  const core = clients.core as unknown as Record<string, (...methodArgs: unknown[]) => Promise<T>>;
  const method = core[methodName];

  if (!method) {
    throw new Error(`Kubernetes client 不支持 ${methodName}`);
  }

  return unwrap(await method.apply(clients.core, args));
}

async function listNodes() {
  const nodeList = await callCore<{ items: V1Node[] }>('listNode');
  return nodeList.items ?? [];
}

async function listPods() {
  const podList = await callCore<V1PodList>('listNamespacedPod', { namespace: config.namespace });
  return podList.items ?? [];
}

async function readPod(namespace: string, name: string) {
  return callCore<V1Pod>('readNamespacedPod', { name, namespace });
}

async function currentSnapshot(): Promise<K8sSnapshot> {
  const [nodes, pods] = await Promise.all([listNodes(), listPods()]);
  return buildSnapshot(nodes, pods, config.schedulerName);
}

async function broadcastSnapshot() {
  const snapshot = await currentSnapshot();
  broadcast({
    type: 'snapshot',
    nodes: snapshot.nodes,
    pendingQueue: snapshot.pendingQueue,
    failedTasks: snapshot.failedTasks,
  });
  return snapshot;
}

async function createBinding(namespace: string, podName: string, nodeName: string) {
  const binding: V1Binding = {
    apiVersion: 'v1',
    kind: 'Binding',
    metadata: {
      name: podName,
      namespace,
    },
    target: {
      apiVersion: 'v1',
      kind: 'Node',
      name: nodeName,
    },
  };

  const core = clients.core as unknown as Record<string, (...methodArgs: unknown[]) => Promise<unknown>>;

  if (core.createNamespacedPodBinding) {
    await core.createNamespacedPodBinding({ name: podName, namespace, body: binding });
    return;
  }

  if (core.createNamespacedBinding) {
    await core.createNamespacedBinding({ namespace, body: binding });
    return;
  }

  throw new Error('Kubernetes client 不支持 Pod Binding API');
}

function assertPodSchedulable(pod: V1Pod) {
  if (pod.spec?.schedulerName !== config.schedulerName) {
    throw new Error(`Pod schedulerName 不是 ${config.schedulerName}`);
  }

  if (pod.spec?.nodeName) {
    throw new Error(`Pod 已经绑定到 ${pod.spec.nodeName}`);
  }

  if (pod.metadata?.deletionTimestamp) {
    throw new Error('Pod 正在删除中');
  }
}

function testPodName() {
  return `demo-pod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createTestPod(name: string): V1Pod {
  const cpu = Math.random() > 0.7 ? '500m' : '250m';
  const memory = Math.random() > 0.7 ? '512Mi' : '256Mi';

  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace: config.namespace,
      labels: {
        app: 'scheduler-demo',
        'scheduler-demo/source': 'k8s-scheduler-api',
      },
    },
    spec: {
      schedulerName: config.schedulerName,
      restartPolicy: 'Never',
      containers: [
        {
          name: 'workload',
          image: config.testPodImage,
          command: ['sh', '-c', 'sleep 3600'],
          resources: {
            requests: {
              cpu,
              memory,
            },
            limits: {
              cpu,
              memory,
            },
          },
        },
      ],
    },
  };
}

async function startWatch(path: string, label: string) {
  const begin = async () => {
    try {
      await clients.watch.watch(
        path,
        {},
        async (phase) => {
          broadcast({
            type: 'log',
            message: `K8s watch ${label}: ${phase}`,
            tone: 'muted',
          });
          await broadcastSnapshot();
        },
        (error) => {
          if (error) {
            broadcast({
              type: 'log',
              message: `K8s watch ${label} 中断: ${error.message}`,
              tone: 'warning',
            });
          }
          windowlessTimeout(begin, 3000);
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      broadcast({
        type: 'log',
        message: `K8s watch ${label} 启动失败: ${message}`,
        tone: 'error',
      });
      windowlessTimeout(begin, 5000);
    }
  };

  await begin();
}

function windowlessTimeout(callback: () => void, ms: number) {
  setTimeout(callback, ms);
}

app.get('/healthz', (_request, response) => {
  response.json({
    ok: true,
    namespace: config.namespace,
    schedulerName: config.schedulerName,
  });
});

app.get('/api/k8s/snapshot', async (_request, response, next) => {
  try {
    response.json(await currentSnapshot());
  } catch (error) {
    next(error);
  }
});

app.get('/api/k8s/events', async (request, response, next) => {
  try {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();

    addEventClient(response);

    const snapshot = await currentSnapshot();
    sendEvent(response, {
      type: 'snapshot',
      nodes: snapshot.nodes,
      pendingQueue: snapshot.pendingQueue,
      failedTasks: snapshot.failedTasks,
    });

    const heartbeat = setInterval(() => {
      sendEvent(response, {
        type: 'log',
        message: 'heartbeat',
        tone: 'muted',
      });
    }, 15000);

    request.on('close', () => {
      clearInterval(heartbeat);
      removeEventClient(response);
      response.end();
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/k8s/scheduler/decisions', async (request, response, next) => {
  try {
    const payload = decisionSchema.parse(request.body);
    const snapshot = await currentSnapshot();
    response.json(decideTargetNode(payload.task, snapshot.nodes, payload.strategy as SchedulerStrategy));
  } catch (error) {
    next(error);
  }
});

app.post('/api/k8s/bindings', async (request, response, next) => {
  try {
    const payload = bindingSchema.parse(request.body);
    const { namespace, name } = splitTaskId(payload.task.id);
    const pod = await readPod(namespace, name);

    assertPodSchedulable(pod);
    await createBinding(namespace, name, payload.targetNodeId);

    broadcast({
      type: 'log',
      message: `真实绑定完成: ${payload.task.name} -> ${payload.targetNodeId}`,
      tone: 'success',
    });

    const snapshot = await broadcastSnapshot();
    response.json({ nodes: snapshot.nodes });
  } catch (error) {
    next(error);
  }
});

app.post('/api/k8s/pods/delete', async (request, response, next) => {
  try {
    const payload = deletePodSchema.parse(request.body);
    const { namespace, name } = splitTaskId(payload.taskId);

    await callCore('deleteNamespacedPod', { name, namespace });

    broadcast({
      type: 'log',
      message: `已删除真实 Pod: ${payload.taskId}`,
      tone: 'muted',
    });

    const snapshot = await broadcastSnapshot();
    response.json({ nodes: snapshot.nodes });
  } catch (error) {
    next(error);
  }
});

app.post('/api/k8s/tasks/burst', async (request, response, next) => {
  try {
    const payload = burstSchema.parse(request.body);
    const pods = await Promise.all(
      Array.from({ length: payload.count }, () =>
        callCore<V1Pod>('createNamespacedPod', { namespace: config.namespace, body: createTestPod(testPodName()) }),
      ),
    );
    const snapshot = await broadcastSnapshot();

    broadcast({
      type: 'log',
      message: `已创建 ${payload.count} 个真实测试 Pod`,
      tone: 'warning',
    });

    response.json({
      tasks: snapshot.pendingQueue.filter((task) => pods.some((pod) => `${config.namespace}/${pod.metadata?.name}` === task.id)),
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status = error instanceof z.ZodError ? 400 : 500;
  const message = error instanceof Error ? error.message : '未知错误';

  response.status(status).send(message);
});

app.listen(config.port, () => {
  console.log(`k8s-scheduler-api listening on :${config.port}`);
  console.log(`namespace=${config.namespace} schedulerName=${config.schedulerName}`);

  void startWatch(`/api/v1/namespaces/${config.namespace}/pods`, 'pods');
  void startWatch('/api/v1/nodes', 'nodes');
});
