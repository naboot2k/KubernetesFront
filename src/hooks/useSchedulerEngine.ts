import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import {
  getFailureReason,
  predictTargetNode,
  scoreNode,
} from '../scheduler/predictTargetNode';
import type {
  ActiveFlight,
  BrokerState,
  ClusterNode,
  FailedTask,
  LogTone,
  RuntimeMode,
  SchedulerDecision,
  SchedulerStrategy,
  Task,
} from '../types/scheduler';

interface LogPayload {
  message: string;
  tone?: LogTone;
}

interface UseSchedulerEngineOptions {
  mode: RuntimeMode;
  pendingQueue: Task[];
  setPendingQueue: Dispatch<SetStateAction<Task[]>>;
  nodes: ClusterNode[];
  setNodes: Dispatch<SetStateAction<ClusterNode[]>>;
  strategy: SchedulerStrategy;
  onLog: (payload: LogPayload) => void;
  decideTask?: (task: Task, nodes: ClusterNode[], strategy: SchedulerStrategy) => Promise<SchedulerDecision>;
  commitBinding?: (flight: ActiveFlight, strategy: SchedulerStrategy) => Promise<{ nodes?: ClusterNode[] } | void>;
  onTaskClaimed?: (task: Task) => void;
  onTaskFailed?: (task: Task) => void;
  onTaskRetry?: (task: Task) => void;
}

function flightId(task: Task) {
  return `flight-${task.id}-${Date.now()}`;
}

function strategyLabel(strategy: SchedulerStrategy) {
  return strategy === 'LLMScheduler' ? 'LLM 调度算法' : '经典调度算法';
}

export function useSchedulerEngine({
  mode,
  pendingQueue,
  setPendingQueue,
  nodes,
  setNodes,
  strategy,
  onLog,
  decideTask,
  commitBinding,
  onTaskClaimed,
  onTaskFailed,
  onTaskRetry,
}: UseSchedulerEngineOptions) {
  const [brokerState, setBrokerState] = useState<BrokerState>({ phase: 'idle', task: null });
  const [activeFlight, setActiveFlight] = useState<ActiveFlight | null>(null);
  const [failedTasks, setFailedTasks] = useState<FailedTask[]>([]);
  const [engineTick, setEngineTick] = useState(0);

  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const nodesRef = useRef(nodes);
  const strategyRef = useRef(strategy);
  const modeRef = useRef(mode);
  const decideTaskRef = useRef(decideTask);
  const commitBindingRef = useRef(commitBinding);
  const onTaskClaimedRef = useRef(onTaskClaimed);
  const onTaskFailedRef = useRef(onTaskFailed);
  const onTaskRetryRef = useRef(onTaskRetry);
  const activeFlightRef = useRef(activeFlight);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    strategyRef.current = strategy;
  }, [strategy]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    decideTaskRef.current = decideTask;
  }, [decideTask]);

  useEffect(() => {
    commitBindingRef.current = commitBinding;
  }, [commitBinding]);

  useEffect(() => {
    onTaskClaimedRef.current = onTaskClaimed;
  }, [onTaskClaimed]);

  useEffect(() => {
    onTaskFailedRef.current = onTaskFailed;
  }, [onTaskFailed]);

  useEffect(() => {
    onTaskRetryRef.current = onTaskRetry;
  }, [onTaskRetry]);

  useEffect(() => {
    activeFlightRef.current = activeFlight;
  }, [activeFlight]);

  const releaseEngine = useCallback(() => {
    busyRef.current = false;
    setEngineTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const moveToFailed = useCallback((task: Task, reason: string) => {
    onTaskFailedRef.current?.(task);
    setFailedTasks((current) => [
      {
        ...task,
        failedAt: Date.now(),
        reason,
      },
      ...current.filter((item) => item.id !== task.id),
    ]);
  }, []);

  useEffect(() => {
    if (busyRef.current || activeFlightRef.current || pendingQueue.length === 0) {
      return;
    }

    const task = pendingQueue[0];
    busyRef.current = true;
    onTaskClaimedRef.current?.(task);

    setPendingQueue((current) => {
      if (current[0]?.id !== task.id) return current;
      return current.slice(1);
    });

    setBrokerState({ phase: 'decision', task });
    onLog({
      message: `⚡ 调度决策中... 选用 ${strategyLabel(strategyRef.current)}`,
      tone: 'warning',
    });

    const timer = window.setTimeout(async () => {
      if (!mountedRef.current) return;

      const nodesSnapshot = nodesRef.current;
      let decision: SchedulerDecision;

      try {
        decision = decideTaskRef.current
          ? await decideTaskRef.current(task, nodesSnapshot, strategyRef.current)
          : {
              targetNodeId: predictTargetNode(task, nodesSnapshot, strategyRef.current),
            };
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';

        moveToFailed(task, `调度后端不可用: ${message}`);
        setBrokerState({ phase: 'idle', task: null });
        onLog({
          message: `❌ 调度失败: ${task.name} 无法从 K8s 调度后端获得决策 (${message})`,
          tone: 'error',
        });
        releaseEngine();
        return;
      }

      const selectedNodeId = decision.targetNodeId;

      if (!selectedNodeId) {
        const reason = decision.reason ?? getFailureReason(task, nodesSnapshot);

        moveToFailed(task, reason);
        setBrokerState({ phase: 'idle', task: null });
        onLog({
          message: `❌ 调度失败: ${task.name} 无法适配任何节点 (原因: ${reason})`,
          tone: 'error',
        });
        onLog({
          message: `资源不足引发的 Pending 状态: ${task.name} 已转入等待重试区`,
          tone: 'error',
        });
        console.warn(`[scheduler] 资源不足引发的 Pending 状态: ${task.name}`);
        releaseEngine();
        return;
      }

      const targetNode = nodesSnapshot.find((node) => node.id === selectedNodeId);
      const score = decision.score ?? (targetNode ? scoreNode(task, targetNode, strategyRef.current) : 1);

      setBrokerState({
        phase: 'flying',
        task,
        targetNodeId: selectedNodeId,
        score,
      });
      setActiveFlight({
        id: flightId(task),
        task,
        targetNodeId: selectedNodeId,
        score,
      });
    }, 300);

    timersRef.current.push(timer);
  }, [engineTick, moveToFailed, onLog, pendingQueue, setPendingQueue, releaseEngine]);

  const completeFlight = useCallback(
    (id: string) => {
      const flight = activeFlightRef.current;

      if (!flight || flight.id !== id) return;

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== flight.targetNodeId) return node;

          return {
            ...node,
            usedCpu: node.usedCpu + flight.task.reqCpu,
            usedMem: node.usedMem + flight.task.reqMem,
            pods: [
              {
                ...flight.task,
                boundAt: Date.now(),
              },
              ...node.pods,
            ],
          };
        }),
      );

      const commit = commitBindingRef.current;

      if (commit) {
        void commit(flight, strategyRef.current)
          .then((result) => {
            if (result?.nodes) {
              setNodes(result.nodes);
            }
          })
          .catch((error: Error) => {
            moveToFailed(flight.task, `Binding API 调用失败: ${error.message}`);
            onLog({
              message: `❌ K8s Binding API 调用失败: ${flight.task.name} -> ${flight.targetNodeId} (${error.message})`,
              tone: 'error',
            });
          });
      }

      onLog({
        message:
          modeRef.current === 'k8s'
            ? `🚀 已提交真实绑定: ${flight.task.name} -> ${flight.targetNodeId} (分值: ${flight.score})`
            : `🚀 成功绑定: ${flight.task.name} -> ${flight.targetNodeId} (分值: ${flight.score})`,
        tone: 'success',
      });
      setActiveFlight(null);
      setBrokerState({ phase: 'idle', task: null });
      releaseEngine();
    },
    [moveToFailed, onLog, releaseEngine, setNodes],
  );

  const retryFailedTask = useCallback(
    (taskId: string) => {
      const failedTask = failedTasks.find((task) => task.id === taskId);
      if (!failedTask) return;

      setFailedTasks((current) => current.filter((task) => task.id !== taskId));
      onTaskRetryRef.current?.(failedTask);
      setPendingQueue((current) => [
        ...current.filter((task) => task.id !== failedTask.id),
        {
          id: failedTask.id,
          name: failedTask.name,
          reqCpu: failedTask.reqCpu,
          reqMem: failedTask.reqMem,
          createdAt: Date.now(),
          image: failedTask.image,
          priority: failedTask.priority,
        },
      ]);
      onLog({
        message: `🔁 重试入队: ${failedTask.name}`,
        tone: 'warning',
      });
    },
    [failedTasks, onLog, setPendingQueue],
  );

  const dropFailedTask = useCallback(
    (taskId: string) => {
      const failedTask = failedTasks.find((task) => task.id === taskId);
      setFailedTasks((current) => current.filter((task) => task.id !== taskId));

      if (failedTask) {
        onLog({
          message: `🧹 丢弃挂起任务: ${failedTask.name}`,
          tone: 'muted',
        });
      }
    },
    [failedTasks, onLog],
  );

  return {
    brokerState,
    activeFlight,
    failedTasks,
    completeFlight,
    retryFailedTask,
    dropFailedTask,
  };
}
