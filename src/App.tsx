import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bindK8sTask,
  createK8sBurst,
  deleteK8sPod,
  getK8sApiBaseUrl,
  requestK8sSchedule,
} from './api/k8sApi';
import { useK8sRealtimeBridge } from './hooks/useK8sRealtimeBridge';
import { useSchedulerEngine } from './hooks/useSchedulerEngine';
import { FailedQueue } from './components/FailedQueue';
import { FlyingTaskLayer } from './components/FlyingTaskLayer';
import { LiveBroker } from './components/LiveBroker';
import { LiveQueue } from './components/LiveQueue';
import { NodeTopologyMatrix } from './components/NodeTopologyMatrix';
import { TerminalLog } from './components/TerminalLog';
import { TopConsole } from './components/TopConsole';
import { formatResourceValue } from './utils/format';
import type {
  ClusterNode,
  K8sConnectionStatus,
  LogEntry,
  LogTone,
  RuntimeMode,
  SchedulerStrategy,
  Task,
} from './types/scheduler';

interface LogPayload {
  message: string;
  tone?: LogTone;
}

function createLog(message: string, tone: LogTone = 'info'): LogEntry {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  return {
    id: randomId,
    timestamp: Date.now(),
    tone,
    message,
  };
}

const runtimeMode: RuntimeMode = 'k8s';
const schedulerStrategy: SchedulerStrategy = 'LLMScheduler';
const noTelemetry = {};

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState<K8sConnectionStatus>('connecting');
  const [pendingQueue, setPendingQueue] = useState<Task[]>([]);
  const [nodes, setNodes] = useState<ClusterNode[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    createLog(`系统就绪: 正在连接真实 K8s 集群 ${getK8sApiBaseUrl()}`, 'muted'),
    createLog('默认调度策略: LLM 调度算法', 'muted'),
  ]);
  const [now, setNow] = useState(Date.now());

  const brokerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());
  const k8sExcludedTaskIdsRef = useRef<Set<string>>(new Set());

  const appendLog = useCallback(({ message, tone = 'info' }: LogPayload) => {
    setLogs((current) => [...current.slice(-179), createLog(message, tone)]);
  }, []);

  const suppressK8sTask = useCallback((task: Task) => {
    k8sExcludedTaskIdsRef.current.add(task.id);
  }, []);

  const releaseK8sTask = useCallback((task: Task) => {
    k8sExcludedTaskIdsRef.current.delete(task.id);
  }, []);

  const shouldAcceptK8sTask = useCallback((task: Task) => !k8sExcludedTaskIdsRef.current.has(task.id), []);

  useK8sRealtimeBridge({
    mode: runtimeMode,
    setNodes,
    setPendingQueue,
    setConnectionStatus,
    onLog: appendLog,
    shouldAcceptTask: shouldAcceptK8sTask,
  });

  const scheduler = useSchedulerEngine({
    mode: runtimeMode,
    pendingQueue,
    setPendingQueue,
    nodes,
    setNodes,
    strategy: schedulerStrategy,
    onLog: appendLog,
    decideTask: requestK8sSchedule,
    commitBinding: bindK8sTask,
    onTaskClaimed: suppressK8sTask,
    onTaskFailed: suppressK8sTask,
    onTaskRetry: releaseK8sTask,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const registerNodeRef = useCallback((nodeId: string, element: HTMLElement | null) => {
    if (element) {
      nodeRefs.current.set(nodeId, element);
      return;
    }

    nodeRefs.current.delete(nodeId);
  }, []);

  const handleBurst = useCallback(() => {
    void createK8sBurst(10)
      .then((result) => {
        const tasks = result.tasks ?? [];

        if (tasks.length > 0) {
          tasks.forEach(releaseK8sTask);
          setPendingQueue((current) => {
            const knownTaskIds = new Set(current.map((task) => task.id));
            return [...current, ...tasks.filter((task) => !knownTaskIds.has(task.id))];
          });
        }

        appendLog({
          message: `⚡ 已请求真实集群创建 ${tasks.length || 10} 个测试 Pod`,
          tone: 'warning',
        });
      })
      .catch((error: Error) => {
        appendLog({
          message: `❌ 创建真实测试 Pod 失败: ${error.message}`,
          tone: 'error',
        });
      });
  }, [appendLog, releaseK8sTask]);

  const handleRemovePod = useCallback(
    (nodeId: string, taskId: string) => {
      const confirmed = window.confirm(
        `确认删除真实集群 Pod？\n\nPod: ${taskId}\nNode: ${nodeId}\n\n该操作会调用 Kubernetes API 删除该 Pod。`,
      );

      if (!confirmed) {
        appendLog({
          message: `已取消删除 Pod: ${taskId}`,
          tone: 'muted',
        });
        return;
      }

      void deleteK8sPod(nodeId, taskId, true)
        .then((result) => {
          if (result.nodes) {
            setNodes(result.nodes);
          }

          appendLog({
            message: `🧹 已请求真实集群删除 Pod: ${taskId}`,
            tone: 'muted',
          });
        })
        .catch((error: Error) => {
          appendLog({
            message: `❌ 删除真实 Pod 失败: ${taskId} (${error.message})`,
            tone: 'error',
          });
        });
    },
    [appendLog],
  );

  const totalCapacity = useMemo(
    () =>
      nodes.reduce(
        (sum, node) => ({
          cpu: sum.cpu + node.capacityCpu,
          mem: sum.mem + node.capacityMem,
          usedCpu: sum.usedCpu + (node.observedCpu ?? node.usedCpu),
          usedMem: sum.usedMem + (node.observedMem ?? node.usedMem),
        }),
        { cpu: 0, mem: 0, usedCpu: 0, usedMem: 0 },
      ),
    [nodes],
  );

  return (
    <main className="flex min-h-screen flex-col gap-3 overflow-y-auto p-3 text-zinc-100 md:p-4 xl:h-screen xl:min-h-0 xl:overflow-hidden">
      <TopConsole
        connectionStatus={connectionStatus}
        pendingCount={pendingQueue.length}
        failedCount={scheduler.failedTasks.length}
        onBurst={handleBurst}
      />

      <div className="grid flex-none grid-cols-1 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[320px_380px_minmax(460px,1fr)]">
        <LiveQueue queue={pendingQueue} now={now} />

        <div className="flex min-h-0 flex-col gap-3">
          <LiveBroker ref={brokerRef} brokerState={scheduler.brokerState} />
          <FailedQueue
            failedTasks={scheduler.failedTasks}
            now={now}
            onRetry={scheduler.retryFailedTask}
            onDrop={scheduler.dropFailedTask}
          />
        </div>

        <NodeTopologyMatrix
          nodes={nodes}
          telemetry={noTelemetry}
          registerNodeRef={registerNodeRef}
          onRemovePod={handleRemovePod}
        />
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 xl:grid-cols-[320px_1fr]">
        <section className="hidden rounded-lg border border-white/10 bg-zinc-950/76 p-3 backdrop-blur xl:block">
          <div className="mb-3 text-xs font-semibold text-zinc-400">Cluster Aggregate</div>
          <div className="space-y-2 font-mono text-xs">
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-teal-300/20 bg-teal-300/10 px-3 py-2.5 text-teal-100">
              <div className="shrink-0 text-zinc-500">CPU</div>
              <div className="min-w-0 whitespace-nowrap text-right text-[15px] font-semibold">
                {formatResourceValue(totalCapacity.usedCpu)}/{formatResourceValue(totalCapacity.cpu)}c
              </div>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2.5 text-amber-100">
              <div className="shrink-0 text-zinc-500">MEM</div>
              <div className="min-w-0 whitespace-nowrap text-right text-[15px] font-semibold">
                {formatResourceValue(totalCapacity.usedMem)}/{formatResourceValue(totalCapacity.mem)}G
              </div>
            </div>
          </div>
        </section>
        <TerminalLog logs={logs} />
      </div>

      <FlyingTaskLayer
        activeFlight={scheduler.activeFlight}
        brokerRef={brokerRef}
        nodeRefs={nodeRefs}
        onComplete={scheduler.completeFlight}
      />
    </main>
  );
}
