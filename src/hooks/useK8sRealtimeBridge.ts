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
}

export function useK8sRealtimeBridge({
  mode,
  setNodes,
  setPendingQueue,
  setConnectionStatus,
  onLog,
}: UseK8sRealtimeBridgeOptions) {
  const onLogRef = useRef(onLog);

  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  useEffect(() => {
    if (mode !== 'k8s') {
      setConnectionStatus('mock');
      return undefined;
    }

    let active = true;
    setConnectionStatus('connecting');

    fetchK8sSnapshot()
      .then((snapshot) => {
        if (!active) return;
        setNodes(snapshot.nodes);
        setPendingQueue(snapshot.pendingQueue);
        setConnectionStatus('connected');
        onLogRef.current({
          message: `已连接真实 K8s 快照: ${snapshot.nodes.length} nodes, ${snapshot.pendingQueue.length} pending pods`,
          tone: 'success',
        });
      })
      .catch((error: Error) => {
        if (!active) return;
        setConnectionStatus('error');
        onLogRef.current({
          message: `K8s 快照同步失败: ${error.message}`,
          tone: 'error',
        });
      });

    const source = openK8sEventStream(
      (event: K8sStreamEvent) => {
        if (!active) return;

        if (event.type === 'snapshot') {
          if (event.nodes) setNodes(event.nodes);
          if (event.pendingQueue) setPendingQueue(event.pendingQueue);
          setConnectionStatus('connected');
          return;
        }

        if (event.type === 'task' && event.task) {
          setPendingQueue((current) => {
            if (current.some((task) => task.id === event.task?.id)) return current;
            return [...current, event.task as Task];
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

    return () => {
      active = false;
      source.close();
    };
  }, [mode, setConnectionStatus, setNodes, setPendingQueue]);
}
