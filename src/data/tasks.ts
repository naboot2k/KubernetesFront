import type { Task } from '../types/scheduler';

let sequence = 1;

const families = [
  { image: 'nginx', cpu: [1, 2], mem: [1, 4], priority: 'normal' },
  { image: 'api-gateway', cpu: [1, 3], mem: [2, 6], priority: 'normal' },
  { image: 'worker', cpu: [2, 5], mem: [4, 12], priority: 'high' },
  { image: 'stream-job', cpu: [3, 6], mem: [6, 16], priority: 'high' },
  { image: 'cache', cpu: [1, 3], mem: [8, 18], priority: 'normal' },
  { image: 'heavy-db', cpu: [5, 8], mem: [18, 34], priority: 'high' },
  { image: 'cron-lite', cpu: [1, 1], mem: [1, 2], priority: 'low' },
] as const;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function suffix() {
  return Math.random().toString(36).slice(2, 5);
}

export function createTask(now = Date.now()): Task {
  const family = families[randomInt(0, families.length - 1)];
  const number = sequence++;

  return {
    id: `task-${number}-${suffix()}`,
    name: `pod-${family.image}-${suffix()}`,
    reqCpu: randomInt(family.cpu[0], family.cpu[1]),
    reqMem: randomInt(family.mem[0], family.mem[1]),
    createdAt: now,
    image: family.image,
    priority: family.priority,
  };
}

export function createTaskBurst(count = 10): Task[] {
  const now = Date.now();

  return Array.from({ length: count }, (_, index) => createTask(now + index));
}
