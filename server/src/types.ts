export type SchedulerStrategy = 'ClassicScheduler' | 'LLMScheduler';
export type Priority = 'low' | 'normal' | 'high';
export type LogTone = 'info' | 'success' | 'warning' | 'error' | 'muted';

export interface Task {
  id: string;
  name: string;
  reqCpu: number;
  reqMem: number;
  createdAt: number;
  image: string;
  priority: Priority;
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
  podCount?: number;
  pods: ScheduledPod[];
}

export interface FailedTask extends Task {
  failedAt: number;
  reason: string;
}

export interface K8sSnapshot {
  nodes: ClusterNode[];
  pendingQueue: Task[];
  failedTasks: FailedTask[];
}

export interface SchedulerDecision {
  targetNodeId: string | null;
  score?: number;
  reason?: string;
}

export interface StreamEvent {
  type: 'snapshot' | 'task' | 'nodeUpdate' | 'failed' | 'log';
  nodes?: ClusterNode[];
  pendingQueue?: Task[];
  failedTasks?: FailedTask[];
  task?: Task;
  reason?: string;
  message?: string;
  tone?: LogTone;
}
