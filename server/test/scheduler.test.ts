import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideTargetNode } from '../src/scheduler.js';
import type { ClusterNode, Task } from '../src/types.js';

const task: Task = {
  id: 'scheduler-demo/pod-a',
  name: 'pod-a',
  reqCpu: 1,
  reqMem: 1,
  createdAt: Date.now(),
  image: 'nginx',
  priority: 'normal',
};

const nodes: ClusterNode[] = [
  {
    id: 'node-a',
    name: 'node-a',
    zone: 'az-a',
    role: 'worker',
    capacityCpu: 4,
    capacityMem: 4,
    usedCpu: 0,
    usedMem: 0,
    pods: [],
  },
  {
    id: 'node-b',
    name: 'node-b',
    zone: 'az-a',
    role: 'worker',
    capacityCpu: 4,
    capacityMem: 4,
    usedCpu: 2,
    usedMem: 2,
    pods: [],
  },
];

test('ClassicScheduler chooses the least loaded balanced node', () => {
  const decision = decideTargetNode(task, nodes, 'ClassicScheduler');

  assert.equal(decision.targetNodeId, 'node-a');
  assert.equal(decision.reason, 'classic resource fit and balance score');
});

test('LLMScheduler avoids dense control-plane nodes for latency sensitive workloads', () => {
  const llmNodes: ClusterNode[] = [
    {
      ...nodes[0],
      role: 'control-plane',
      podCount: 300,
    },
    {
      ...nodes[1],
      usedCpu: 1,
      usedMem: 1,
      role: 'worker',
      podCount: 12,
    },
  ];
  const webTask = {
    ...task,
    name: 'pod-nginx-api',
    image: 'nginx:1.27-alpine',
    priority: 'high' as const,
  };
  const decision = decideTargetNode(webTask, llmNodes, 'LLMScheduler');

  assert.equal(decision.targetNodeId, 'node-b');
  assert.equal(decision.reason, 'local LLM-style workload reasoning');
});

test('returns null when no node fits', () => {
  const heavy = { ...task, reqCpu: 99 };
  const decision = decideTargetNode(heavy, nodes, 'ClassicScheduler');

  assert.equal(decision.targetNodeId, null);
  assert.equal(decision.reason, 'CPU 不足');
});
