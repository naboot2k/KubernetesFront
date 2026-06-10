import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCpu, parseMemoryGiB } from '../src/quantity.js';

test('parseCpu converts Kubernetes CPU quantities to cores', () => {
  assert.equal(parseCpu('500m'), 0.5);
  assert.equal(parseCpu('250000000n'), 0.25);
  assert.equal(parseCpu('250000u'), 0.25);
  assert.equal(parseCpu('1'), 1);
  assert.equal(parseCpu('250m'), 0.25);
});

test('parseMemoryGiB converts Kubernetes memory quantities to GiB', () => {
  assert.equal(parseMemoryGiB('1Gi'), 1);
  assert.equal(parseMemoryGiB('512Mi'), 0.5);
  assert.equal(parseMemoryGiB('1073741824'), 1);
});
