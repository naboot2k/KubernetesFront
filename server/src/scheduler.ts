import type { ClusterNode, SchedulerDecision, SchedulerStrategy, Task } from './types.js';

function canFit(task: Task, node: ClusterNode) {
  return node.usedCpu + task.reqCpu <= node.capacityCpu && node.usedMem + task.reqMem <= node.capacityMem;
}

function projectedLoad(task: Task, node: ClusterNode) {
  const cpuRatio = node.capacityCpu > 0 ? (node.usedCpu + task.reqCpu) / node.capacityCpu : 1;
  const memRatio = node.capacityMem > 0 ? (node.usedMem + task.reqMem) / node.capacityMem : 1;

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

export function decideTargetNode(task: Task, nodes: ClusterNode[], strategy: SchedulerStrategy): SchedulerDecision {
  const candidates = nodes.filter((node) => canFit(task, node));

  if (candidates.length === 0) {
    return {
      targetNodeId: null,
      reason: getFailureReason(task, nodes),
    };
  }

  const ranked = [...candidates].sort((left, right) => {
    const leftLoad = projectedLoad(task, left);
    const rightLoad = projectedLoad(task, right);

    return strategy === 'LeastRequested' ? leftLoad - rightLoad : rightLoad - leftLoad;
  });
  const target = ranked[0];

  return {
    targetNodeId: target.id,
    score: scoreNode(task, target, strategy),
    reason: strategy === 'LeastRequested' ? 'least allocated node' : 'most allocated fit node',
  };
}
