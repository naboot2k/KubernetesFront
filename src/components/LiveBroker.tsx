import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Cpu } from 'lucide-react';
import type { BrokerState } from '../types/scheduler';

interface LiveBrokerProps {
  brokerState: BrokerState;
}

export const LiveBroker = forwardRef<HTMLDivElement, LiveBrokerProps>(({ brokerState }, ref) => {
  const task = brokerState.task;

  return (
    <section className="flex min-h-[300px] flex-col rounded-lg border border-white/10 bg-zinc-950/76 backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-50">Live Broker</h2>
          <p className="mt-1 text-xs text-zinc-500">Pluggable Scheduler Engine</p>
        </div>
        <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-xs text-zinc-300">
          {brokerState.phase.toUpperCase()}
        </span>
      </div>

      <div className="grid flex-1 place-items-center p-4">
        <motion.div
          ref={ref}
          layout
          className={`relative grid min-h-44 w-full max-w-sm place-items-center overflow-hidden rounded-lg border p-5 text-center ${
            brokerState.phase === 'idle'
              ? 'border-white/10 bg-white/[0.035]'
              : 'border-teal-300/40 bg-teal-300/10 shadow-glow'
          }`}
        >
          <div className="absolute inset-0 scanline opacity-40" />

          {!task ? (
            <div className="relative">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-white/10 bg-zinc-900 text-zinc-500">
                <Cpu size={22} />
              </div>
              <div className="mt-4 text-sm font-medium text-zinc-300">等待队头任务</div>
            </div>
          ) : (
            <motion.div
              className="relative w-full"
              animate={brokerState.phase === 'decision' ? { scale: [1, 1.03, 1] } : { scale: 0.98 }}
              transition={{ duration: 0.32, repeat: brokerState.phase === 'decision' ? Infinity : 0 }}
            >
              <div className="mx-auto w-fit rounded-md border border-teal-300/30 bg-zinc-950/80 px-4 py-3 shadow-glow">
                <div className="font-mono text-sm font-semibold text-teal-100">{task.name}</div>
                <div className="mt-2 flex justify-center gap-2 font-mono text-xs">
                  <span className="rounded bg-teal-300/15 px-2 py-1 text-teal-100">CPU {task.reqCpu}</span>
                  <span className="rounded bg-amber-300/15 px-2 py-1 text-amber-100">MEM {task.reqMem}G</span>
                </div>
              </div>

              {brokerState.phase === 'decision' ? (
                <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-amber-100">
                  <motion.span
                    className="h-2 w-2 rounded-full bg-amber-300"
                    animate={{ opacity: [0.35, 1, 0.35] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                  />
                  决策中...
                </div>
              ) : (
                <div className="mt-5 text-xs text-zinc-300">
                  目标 {brokerState.targetNodeId} · score {brokerState.score}
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
});

LiveBroker.displayName = 'LiveBroker';
