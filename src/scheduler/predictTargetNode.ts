import type { ClusterNode, SchedulerStrategy, Task } from '../types/scheduler';

export function canFit(task: Task, node: ClusterNode) {
  return node.usedCpu + task.reqCpu <= node.capacityCpu && node.usedMem + task.reqMem <= node.capacityMem;
}

function projectedLoad(task: Task, node: ClusterNode) {
  const cpuRatio = (node.usedCpu + task.reqCpu) / node.capacityCpu;
  const memRatio = (node.usedMem + task.reqMem) / node.capacityMem;

  return (cpuRatio + memRatio) / 2;
}

export function scoreNode(task: Task, node: ClusterNode, strategy: SchedulerStrategy) {
  const load = projectedLoad(task, node);
  const rawScore = strategy === 'LeastRequested' ? 1 - load : load;

  return Math.max(1, Math.min(99, Math.round(rawScore * 100)));
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
   * 这里目前是前端伪调度逻辑，用于 Demo 演示 LeastRequested / MostRequested。
   * 后续接入真实 Kubernetes 调度器时，可以在 useSchedulerEngine 中把这一行替换为：
   * - Fetch: POST /api/scheduler/predict { task, nodes, strategy }
   * - WebSocket: scheduler.predict 事件并等待后端返回 nodeId / score / reason
   * UI 与队列层不需要知道算法如何实现，只依赖本函数的 nodeId | null 决策结果。
   */
  const candidates = nodes.filter((node) => canFit(task, node));

  if (candidates.length === 0) {
    return null;
  }

  const ranked = [...candidates].sort((left, right) => {
    const leftLoad = projectedLoad(task, left);
    const rightLoad = projectedLoad(task, right);

    if (strategy === 'LeastRequested') {
      return leftLoad - rightLoad;
    }

    return rightLoad - leftLoad;
  });

  return ranked[0]?.id ?? null;
}
