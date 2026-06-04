import { AnimatePresence, motion } from 'framer-motion';
import { Clock3 } from 'lucide-react';
import type { Task } from '../types/scheduler';
import { formatClock, formatDuration } from '../utils/format';

interface LiveQueueProps {
  queue: Task[];
  now: number;
}

export function LiveQueue({ queue, now }: LiveQueueProps) {
  return (
    <section className="flex min-h-[360px] flex-col rounded-lg border border-white/10 bg-zinc-950/76 backdrop-blur xl:min-h-0">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-50">Live Queue</h2>
          <p className="mt-1 text-xs text-zinc-500">Pending Queue · FIFO</p>
        </div>
        <span className="rounded border border-teal-300/30 bg-teal-300/10 px-2 py-1 font-mono text-xs text-teal-100">
          depth {queue.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <AnimatePresence initial={false}>
          {queue.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid h-full min-h-64 place-items-center rounded-md border border-dashed border-white/10 text-center text-sm text-zinc-500"
            >
              队列空闲
            </motion.div>
          ) : (
            queue.slice(0, 28).map((task, index) => (
              <motion.article
                layout
                key={task.id}
                initial={{ opacity: 0, y: -18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 28, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="mb-2 rounded-md border border-white/10 bg-white/[0.055] p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-semibold text-zinc-100">{task.name}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                      <Clock3 size={12} />
                      <span>{formatClock(task.createdAt)}</span>
                      <span>· 等待 {formatDuration(now - task.createdAt)}</span>
                    </div>
                  </div>
                  <span
                    className={`rounded px-2 py-1 text-[11px] font-semibold ${
                      index === 0 ? 'bg-amber-300 text-zinc-950' : 'bg-white/10 text-zinc-300'
                    }`}
                  >
                    {index === 0 ? 'HEAD' : `#${index + 1}`}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
                  <span className="rounded border border-teal-300/20 bg-teal-300/10 px-2 py-1 text-teal-100">
                    CPU {task.reqCpu}
                  </span>
                  <span className="rounded border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-amber-100">
                    MEM {task.reqMem}G
                  </span>
                </div>
              </motion.article>
            ))
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
