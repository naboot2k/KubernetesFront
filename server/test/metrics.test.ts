import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NodeMetricsList } from '@kubernetes/client-node/dist/metrics.js';
import { mapNodeMetrics } from '../src/metrics.js';

test('mapNodeMetrics converts node metrics to core and GiB usage', () => {
  const metrics: NodeMetricsList = {
    kind: 'NodeMetricsList',
    apiVersion: 'metrics.k8s.io/v1beta1',
    metadata: {
      selfLink: '',
    },
    items: [
      {
        metadata: {
          name: 'node-a',
          selfLink: '',
          creationTimestamp: '2026-06-10T00:00:00Z',
        },
        timestamp: '2026-06-10T00:00:10Z',
        window: '30s',
        usage: {
          cpu: '250000000n',
          memory: '512Mi',
        },
      },
    ],
  };

  const usage = mapNodeMetrics(metrics).get('node-a');

  assert.equal(usage?.cpu, 0.25);
  assert.equal(usage?.mem, 0.5);
  assert.equal(usage?.observedAt, new Date('2026-06-10T00:00:10Z').getTime());
});
