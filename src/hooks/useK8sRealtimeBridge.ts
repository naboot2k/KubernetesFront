import { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import { fetchK8sSnapshot, openK8sEventStream } from '../api/k8sApi';
import type {
  ClusterNode,
  K8sConnectionStatus,
  K8sStreamEvent,
  LogTone,
  RuntimeMode,
  Task,
} from '../types/scheduler';

interface LogPayload {
  message: string;
  tone?: LogTone;
}

interface UseK8sRealtimeBridgeOptions {
  mode: RuntimeMode;
  setNodes: Dispatch<SetStateAction<ClusterNode[]>>;
  setPendingQueue: Dispatch<SetStateAction<Task[]>>;
  setConnectionStatus: Dispatch<SetStateAction<K8sConnectionStatus>>;
  onLog: (payload: LogPayload) => void;
  shouldAcceptTask?: (task: Task) => boolean;
}

export function useK8sRealtimeBridge({
  mode,
  setNodes,
  setPendingQueue,
  setConnectionStatus,
  onLog,
  shouldAcceptTask,
}: UseK8sRealtimeBridgeOptions) {
  const onLogRef = useRef(onLog);
  const shouldAcceptTaskRef = useRef(shouldAcceptTask);

  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  useEffect(() => {
    shouldAcceptTaskRef.current = shouldAcceptTask;
  }, [shouldAcceptTask]);

  useEffect(() => {
    if (mode !== 'k8s') {
      setConnectionStatus('mock');
      return undefined;
    }

    let active = true;
    let source: EventSource | null = null;
    setConnectionStatus('connecting');

    const filterPendingTasks = (tasks: Task[]) => {
      const accept = shouldAcceptTaskRef.current;
      return accept ? tasks.filter(accept) : tasks;
    };

    fetchK8sSnapshot()
      .then((snapshot) => {
        if (!active) return;
        const pendingQueue = filterPendingTasks(snapshot.pendingQueue);
        setNodes(snapshot.nodes);
        setPendingQueue(pendingQueue);
        setConnectionStatus('connected');
        onLogRef.current({
          message: `已连接真实 K8s 快照: ${snapshot.nodes.length} nodes, ${pendingQueue.length}/${snapshot.pendingQueue.length} pending pods`,
          tone: 'success',
        });

        source = openK8sEventStream(
          (event: K8sStreamEvent) => {
            if (!active) return;

            if (event.type === 'snapshot') {
              if (event.nodes) setNodes(event.nodes);
              if (event.pendingQueue) setPendingQueue(filterPendingTasks(event.pendingQueue));
              setConnectionStatus('connected');
              return;
            }

            if (event.type === 'task' && event.task) {
              const task = event.task;
              if (shouldAcceptTaskRef.current && !shouldAcceptTaskRef.current(task)) return;

              setPendingQueue((current) => {
                if (current.some((item) => item.id === task.id)) return current;
                return [...current, task];
              });
              return;
            }

            if (event.type === 'nodeUpdate' && event.nodes) {
              setNodes(event.nodes);
              return;
            }

            if (event.type === 'log' && event.message) {
              onLogRef.current({
                message: event.message,
                tone: event.tone ?? 'info',
              });
            }
          },
          () => {
            if (!active) return;
            setConnectionStatus('disconnected');
            onLogRef.current({
              message: 'K8s 事件流连接中断，等待后端或 Ingress 恢复',
              tone: 'warning',
            });
          },
        );
      })
      .catch((error: Error) => {
        if (!active) return;
        setConnectionStatus('error');
        onLogRef.current({
          message: `K8s 快照同步失败: ${error.message}`,
          tone: 'error',
        });
      });

    return () => {
      active = false;
      source?.close();
    };
  }, [mode, setConnectionStatus, setNodes, setPendingQueue]);
}
