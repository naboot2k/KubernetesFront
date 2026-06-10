export type SchedulerStrategy = 'LeastRequested' | 'MostRequested';

export type RuntimeMode = 'mock' | 'k8s';

export type LogTone = 'info' | 'success' | 'warning' | 'error' | 'muted';

export interface Task {
  id: string;
  name: string;
  reqCpu: number;
  reqMem: number;
  createdAt: number;
  image: string;
  priority: 'low' | 'normal' | 'high';
}

export interface ScheduledPod extends Task {
  boundAt: number;
}

export interface ClusterNode {
  id: string;
  name: string;
  zone: string;
  role: string;
  capacityCpu: number;
  capacityMem: number;
  observedCpu?: number;
  observedMem?: number;
  observedAt?: number;
  metricsSource?: 'metrics-server';
  usedCpu: number;
  usedMem: number;
  pods: ScheduledPod[];
}

export interface FailedTask extends Task {
  failedAt: number;
  reason: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  tone: LogTone;
  message: string;
}

export interface BrokerState {
  phase: 'idle' | 'decision' | 'flying';
  task: Task | null;
  targetNodeId?: string;
  score?: number;
}

export interface ActiveFlight {
  id: string;
  task: Task;
  targetNodeId: string;
  score: number;
}

export interface NodeTelemetry {
  cpuNoise: number;
  memNoise: number;
}

export interface SchedulerDecision {
  targetNodeId: string | null;
  score?: number;
  reason?: string;
}

export interface K8sSnapshot {
  nodes: ClusterNode[];
  pendingQueue: Task[];
  failedTasks?: FailedTask[];
}

export type K8sConnectionStatus = 'mock' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface K8sStreamEvent {
  type: 'snapshot' | 'task' | 'nodeUpdate' | 'failed' | 'log';
  nodes?: ClusterNode[];
  pendingQueue?: Task[];
  failedTasks?: FailedTask[];
  task?: Task;
  reason?: string;
  message?: string;
  tone?: LogTone;
}
