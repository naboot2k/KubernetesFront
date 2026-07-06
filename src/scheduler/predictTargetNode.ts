import type { ClusterNode, SchedulerStrategy, Task } from '../types/scheduler';

export function canFit(task: Task, node: ClusterNode) {
  return node.usedCpu + task.reqCpu <= node.capacityCpu && node.usedMem + task.reqMem <= node.capacityMem;
}

function safeRatio(used: number, capacity: number) {
  if (capacity <= 0) return 1;
  return used / capacity;
}

function projectedRatios(task: Task, node: ClusterNode) {
  return {
    cpu: safeRatio(node.usedCpu + task.reqCpu, node.capacityCpu),
    mem: safeRatio(node.usedMem + task.reqMem, node.capacityMem),
  };
}

function currentRatios(node: ClusterNode) {
  return {
    cpu: safeRatio(node.usedCpu, node.capacityCpu),
    mem: safeRatio(node.usedMem, node.capacityMem),
  };
}

function clampScore(score: number) {
  return Math.max(1, Math.min(99, Math.round(score)));
}

function classicScore(task: Task, node: ClusterNode) {
  const projected = projectedRatios(task, node);
  const leastAllocated = (2 - projected.cpu - projected.mem) / 2;
  const balancedAllocation = 1 - Math.abs(projected.cpu - projected.mem);
  const headroom =
    Math.min(node.capacityCpu - node.usedCpu - task.reqCpu, node.capacityMem - node.usedMem - task.reqMem) /
    Math.max(node.capacityCpu, node.capacityMem, 1);

  return clampScore((leastAllocated * 0.55 + balancedAllocation * 0.35 + Math.max(0, headroom) * 0.1) * 100);
}

function workloadProfile(task: Task) {
  const text = `${task.name} ${task.image}`.toLowerCase();
  const cpuHeavy = task.reqCpu >= task.reqMem || /api|worker|compute|batch|job|cpu|infer/.test(text);
  const memHeavy = task.reqMem > task.reqCpu * 1.5 || /db|cache|redis|mongo|mysql|mem|state/.test(text);
  const latencySensitive = task.priority === 'high' || /api|gateway|nginx|web|frontend|svc/.test(text);

  return { cpuHeavy, memHeavy, latencySensitive };
}

function llmReasoningScore(task: Task, node: ClusterNode) {
  const projected = projectedRatios(task, node);
  const current = currentRatios(node);
  const profile = workloadProfile(task);
  const podDensity = safeRatio(node.podCount ?? node.pods.length, 120);
  const observedCpu = safeRatio(node.observedCpu ?? node.usedCpu, node.capacityCpu);
  const observedMem = safeRatio(node.observedMem ?? node.usedMem, node.capacityMem);

  let score = 72;

  score += (1 - projected.cpu) * (profile.cpuHeavy ? 22 : 12);
  score += (1 - projected.mem) * (profile.memHeavy ? 22 : 12);
  score += (1 - Math.abs(projected.cpu - projected.mem)) * 12;
  score += (1 - Math.max(observedCpu, observedMem)) * (profile.latencySensitive ? 14 : 6);
  score -= podDensity * (profile.latencySensitive ? 10 : 5);

  if (task.priority === 'high') score += 5;
  if (node.role.includes('master') || node.role.includes('control-plane')) score -= 20;
  if (profile.memHeavy && current.mem > current.cpu + 0.2) score -= 8;
  if (profile.cpuHeavy && current.cpu > current.mem + 0.2) score -= 8;

  return clampScore(score);
}

export function scoreNode(task: Task, node: ClusterNode, strategy: SchedulerStrategy) {
  return strategy === 'LLMScheduler' ? llmReasoningScore(task, node) : classicScore(task, node);
}

export function getFailureReason(task: Task, nodes: ClusterNode[]) {
  const hasCpuRoom = nodes.some((node) => node.usedCpu + task.reqCpu <= node.capacityCpu);
  const hasMemRoom = nodes.some((node) => node.usedMem + task.reqMem <= node.capacityMem);

  if (!hasCpuRoom && !hasMemRoom) return 'CPU 与内存不足';
  if (!hasCpuRoom) return 'CPU 不足';
  if (!hasMemRoom) return '内存不足';

  return '节点资源碎片化';
}

export function predictTargetNode(task: Task, nodes: ClusterNode[], strategy: SchedulerStrategy): string | null {
  /*
   * Pluggable Scheduler Engine boundary:
   * 这里目前是前端伪调度逻辑，用于 Demo 演示 ClassicScheduler / LLMScheduler。
   * 后续接入真实 Kubernetes 调度器时，可以在 useSchedulerEngine 中把这一行替换为：
   * - Fetch: POST /api/scheduler/predict { task, nodes, strategy }
   * - WebSocket: scheduler.predict 事件并等待后端返回 nodeId / score / reason
   * LLMScheduler 目前是本地启发式“LLM 意图推理”实现；后续可替换为真实 LLM/Agent API。
   * UI 与队列层不需要知道算法如何实现，只依赖本函数的 nodeId | null 决策结果。
   */
  const candidates = nodes.filter((node) => canFit(task, node));

  if (candidates.length === 0) {
    return null;
  }

  const ranked = [...candidates].sort((left, right) => scoreNode(task, right, strategy) - scoreNode(task, left, strategy));

  return ranked[0]?.id ?? null;
}
