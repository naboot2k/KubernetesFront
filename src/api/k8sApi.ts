import type {
  ActiveFlight,
  ClusterNode,
  K8sSnapshot,
  K8sStreamEvent,
  SchedulerDecision,
  SchedulerStrategy,
  Task,
} from '../types/scheduler';

const DEFAULT_API_BASE = '/api/k8s';

export function getK8sApiBaseUrl() {
  return import.meta.env.VITE_K8S_API_BASE_URL || DEFAULT_API_BASE;
}

function apiUrl(path: string) {
  const baseUrl = getK8sApiBaseUrl().replace(/\/$/, '');
  return `${baseUrl}${path}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Kubernetes API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchK8sSnapshot() {
  return requestJson<K8sSnapshot>('/snapshot');
}

export function requestK8sSchedule(task: Task, nodes: ClusterNode[], strategy: SchedulerStrategy) {
  return requestJson<SchedulerDecision>('/scheduler/decisions', {
    method: 'POST',
    body: JSON.stringify({ task, nodes, strategy }),
  });
}

export async function bindK8sTask(flight: ActiveFlight, strategy: SchedulerStrategy) {
  return requestJson<{ nodes?: ClusterNode[] }>('/bindings', {
    method: 'POST',
    body: JSON.stringify({
      task: flight.task,
      targetNodeId: flight.targetNodeId,
      score: flight.score,
      strategy,
    }),
  });
}

export function deleteK8sPod(nodeId: string, taskId: string) {
  return requestJson<{ nodes?: ClusterNode[] }>('/pods/delete', {
    method: 'POST',
    body: JSON.stringify({ nodeId, taskId }),
  });
}

export function createK8sBurst(count: number) {
  return requestJson<{ tasks?: Task[] }>('/tasks/burst', {
    method: 'POST',
    body: JSON.stringify({ count }),
  });
}

export function openK8sEventStream(onEvent: (event: K8sStreamEvent) => void, onError: () => void) {
  const source = new EventSource(apiUrl('/events'));

  source.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data) as K8sStreamEvent);
    } catch {
      onEvent({
        type: 'log',
        message: 'K8s 事件流返回了无法解析的消息',
        tone: 'error',
      });
    }
  };

  source.onerror = () => {
    onError();
  };

  return source;
}
