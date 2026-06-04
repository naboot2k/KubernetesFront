import { RotateCw, X } from 'lucide-react';
import type { FailedTask } from '../types/scheduler';
import { formatDuration } from '../utils/format';

interface FailedQueueProps {
  failedTasks: FailedTask[];
  now: number;
  onRetry: (taskId: string) => void;
  onDrop: (taskId: string) => void;
}

export function FailedQueue({ failedTasks, now, onRetry, onDrop }: FailedQueueProps) {
  return (
    <section className="flex min-h-[240px] flex-1 flex-col rounded-lg border border-rose-300/18 bg-zinc-950/76 backdrop-blur xl:min-h-0">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-50">Pending / Failed</h2>
          <p className="mt-1 text-xs text-zinc-500">等待重试区</p>
        </div>
        <span className="rounded border border-rose-300/30 bg-rose-300/10 px-2 py-1 font-mono text-xs text-rose-100">
          {failedTasks.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {failedTasks.length === 0 ? (
          <div className="grid h-full min-h-32 place-items-center rounded-md border border-dashed border-white/10 text-sm text-zinc-500">
            无挂起任务
          </div>
        ) : (
          failedTasks.slice(0, 10).map((task) => (
            <article key={task.id} className="mb-2 rounded-md border border-rose-300/20 bg-rose-300/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-semibold text-rose-100">{task.name}</div>
                  <div className="mt-1 text-xs text-rose-200/70">
                    {task.reason} · 挂起 {formatDuration(now - task.failedAt)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onRetry(task.id)}
                    title="重试入队"
                    className="grid h-8 w-8 place-items-center rounded border border-amber-300/30 bg-amber-300/10 text-amber-100 transition hover:bg-amber-300/20"
                  >
                    <RotateCw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDrop(task.id)}
                    title="丢弃"
                    className="grid h-8 w-8 place-items-center rounded border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
