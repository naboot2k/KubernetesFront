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
  SchedulerStrategy,
  Task,
} from '../types/scheduler';

interface LogPayload {
  message: string;
  tone?: LogTone;
}

interface UseSchedulerEngineOptions {
  pendingQueue: Task[];
  setPendingQueue: Dispatch<SetStateAction<Task[]>>;
  nodes: ClusterNode[];
  setNodes: Dispatch<SetStateAction<ClusterNode[]>>;
  strategy: SchedulerStrategy;
  onLog: (payload: LogPayload) => void;
}

function flightId(task: Task) {
  return `flight-${task.id}-${Date.now()}`;
}

export function useSchedulerEngine({
  pendingQueue,
  setPendingQueue,
  nodes,
  setNodes,
  strategy,
  onLog,
}: UseSchedulerEngineOptions) {
  const [brokerState, setBrokerState] = useState<BrokerState>({ phase: 'idle', task: null });
  const [activeFlight, setActiveFlight] = useState<ActiveFlight | null>(null);
  const [failedTasks, setFailedTasks] = useState<FailedTask[]>([]);
  const [engineTick, setEngineTick] = useState(0);

  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const nodesRef = useRef(nodes);
  const strategyRef = useRef(strategy);
  const activeFlightRef = useRef(activeFlight);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    strategyRef.current = strategy;
  }, [strategy]);

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

  useEffect(() => {
    if (busyRef.current || activeFlightRef.current || pendingQueue.length === 0) {
      return;
    }

    const task = pendingQueue[0];
    busyRef.current = true;

    setPendingQueue((current) => {
      if (current[0]?.id !== task.id) return current;
      return current.slice(1);
    });

    setBrokerState({ phase: 'decision', task });
    onLog({
      message: `⚡ 调度决策中... 选用 ${strategyRef.current} 策略`,
      tone: 'warning',
    });

    const timer = window.setTimeout(() => {
      if (!mountedRef.current) return;

      const nodesSnapshot = nodesRef.current;
      const selectedNodeId = predictTargetNode(task, nodesSnapshot, strategyRef.current);

      if (!selectedNodeId) {
        const reason = getFailureReason(task, nodesSnapshot);

        setFailedTasks((current) => [
          {
            ...task,
            failedAt: Date.now(),
            reason,
          },
          ...current,
        ]);
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
      const score = targetNode ? scoreNode(task, targetNode, strategyRef.current) : 1;

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
  }, [engineTick, onLog, pendingQueue, setPendingQueue, releaseEngine]);

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

      onLog({
        message: `🚀 成功绑定: ${flight.task.name} -> ${flight.targetNodeId} (分值: ${flight.score})`,
        tone: 'success',
      });
      setActiveFlight(null);
      setBrokerState({ phase: 'idle', task: null });
      releaseEngine();
    },
    [onLog, releaseEngine, setNodes],
  );

  const retryFailedTask = useCallback(
    (taskId: string) => {
      const failedTask = failedTasks.find((task) => task.id === taskId);
      if (!failedTask) return;

      setFailedTasks((current) => current.filter((task) => task.id !== taskId));
      setPendingQueue((current) => [
        ...current,
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
