import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { V1Node, V1Pod } from '@kubernetes/client-node';
import { buildSnapshot, isPendingForScheduler, mapPodToTask } from '../src/snapshot.js';

const schedulerName = 'demo-scheduler';

function pod(overrides: Partial<V1Pod>): V1Pod {
  return {
    metadata: {
      namespace: 'scheduler-demo',
      name: 'pod-a',
      creationTimestamp: new Date('2026-06-08T00:00:00Z'),
    },
    spec: {
      schedulerName,
      containers: [
        {
          name: 'main',
          image: 'nginx',
          resources: {
            requests: {
              cpu: '500m',
              memory: '512Mi',
            },
          },
        },
      ],
    },
    status: {
      phase: 'Pending',
    },
    ...overrides,
  };
}

test('mapPodToTask maps resource requests and identity', () => {
  const task = mapPodToTask(pod({}));

  assert.equal(task.id, 'scheduler-demo/pod-a');
  assert.equal(task.reqCpu, 0.5);
  assert.equal(task.reqMem, 0.5);
  assert.equal(task.image, 'nginx');
});

test('isPendingForScheduler only accepts unbound pods for configured scheduler', () => {
  assert.equal(isPendingForScheduler(pod({}), schedulerName), true);
  assert.equal(isPendingForScheduler(pod({ spec: { schedulerName, nodeName: 'node-a', containers: [] } }), schedulerName), false);
  assert.equal(isPendingForScheduler(pod({ spec: { schedulerName: 'default-scheduler', containers: [] } }), schedulerName), false);
});

test('buildSnapshot separates pending and bound pods', () => {
  const node: V1Node = {
    metadata: {
      name: 'node-a',
      labels: {
        'topology.kubernetes.io/zone': 'az-a',
      },
    },
    status: {
      allocatable: {
        cpu: '4',
        memory: '8Gi',
      },
    },
  };
  const pending = pod({});
  const bound = pod({
    metadata: { namespace: 'scheduler-demo', name: 'pod-b' },
    spec: { schedulerName, nodeName: 'node-a', containers: pending.spec?.containers ?? [] },
    status: { phase: 'Running', startTime: new Date('2026-06-08T00:01:00Z') },
  });
  const snapshot = buildSnapshot([node], [pending, bound], schedulerName);

  assert.equal(snapshot.pendingQueue.length, 1);
  assert.equal(snapshot.nodes[0].pods.length, 1);
  assert.equal(snapshot.nodes[0].usedCpu, 0.5);
  assert.equal(snapshot.nodes[0].usedMem, 0.5);
});
