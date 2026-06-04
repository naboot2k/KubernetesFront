import { useEffect, useRef } from 'react';
import { createTask } from '../data/tasks';
import type { Task } from '../types/scheduler';

interface UseTaskIngestionOptions {
  enabled: boolean;
  intervalMs: number;
  onTask: (task: Task) => void;
}

export function useTaskIngestion({ enabled, intervalMs, onTask }: UseTaskIngestionOptions) {
  const onTaskRef = useRef(onTask);

  useEffect(() => {
    onTaskRef.current = onTask;
  }, [onTask]);

  useEffect(() => {
    if (!enabled) return undefined;

    const timer = window.setInterval(() => {
      onTaskRef.current(createTask());
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);
}
