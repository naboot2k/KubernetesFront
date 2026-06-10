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

test('LeastRequested chooses the least loaded node', () => {
  assert.equal(decideTargetNode(task, nodes, 'LeastRequested').targetNodeId, 'node-a');
});

test('MostRequested chooses the most loaded node that still fits', () => {
  assert.equal(decideTargetNode(task, nodes, 'MostRequested').targetNodeId, 'node-b');
});

test('returns null when no node fits', () => {
  const heavy = { ...task, reqCpu: 99 };
  const decision = decideTargetNode(heavy, nodes, 'LeastRequested');

  assert.equal(decision.targetNodeId, null);
  assert.equal(decision.reason, 'CPU 不足');
});
