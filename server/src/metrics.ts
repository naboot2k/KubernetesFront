import type { NodeMetricsList } from '@kubernetes/client-node/dist/metrics.js';
import { parseCpu, parseMemoryGiB } from './quantity.js';

export interface NodeUsageMetric {
  cpu: number;
  mem: number;
  observedAt: number;
}

export type NodeUsageMap = Map<string, NodeUsageMetric>;

export function mapNodeMetrics(metrics?: NodeMetricsList): NodeUsageMap {
  const usageByNode: NodeUsageMap = new Map();

  for (const item of metrics?.items ?? []) {
    const nodeName = item.metadata?.name;
    if (!nodeName) continue;

    usageByNode.set(nodeName, {
      cpu: parseCpu(item.usage?.cpu),
      mem: parseMemoryGiB(item.usage?.memory),
      observedAt: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
    });
  }

  return usageByNode;
}
