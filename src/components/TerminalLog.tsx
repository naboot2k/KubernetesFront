import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import type { LogEntry, LogTone } from '../types/scheduler';
import { formatClock } from '../utils/format';

interface TerminalLogProps {
  logs: LogEntry[];
}

const toneClass: Record<LogTone, string> = {
  info: 'text-teal-100',
  success: 'text-emerald-100',
  warning: 'text-amber-100',
  error: 'text-rose-100',
  muted: 'text-zinc-500',
};

export function TerminalLog({ logs }: TerminalLogProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [logs]);

  return (
    <section className="flex h-44 shrink-0 flex-col rounded-lg border border-emerald-300/18 bg-black/88 font-mono shadow-glow">
      <div className="flex items-center justify-between border-b border-emerald-300/15 px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-100">
          <Terminal size={14} />
          Real-time Terminal
        </div>
        <span className="text-[11px] text-emerald-200/50">event stream</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-2 text-xs leading-6">
        {logs.length === 0 ? (
          <div className="text-zinc-600">[system] waiting for scheduler events...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={toneClass[log.tone]}>
              <span className="text-emerald-300/70">[{formatClock(log.timestamp)}]</span> {log.message}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
