import { Activity, RadioTower, Zap } from 'lucide-react';
import type { K8sConnectionStatus } from '../types/scheduler';

interface TopConsoleProps {
  connectionStatus: K8sConnectionStatus;
  pendingCount: number;
  failedCount: number;
  onBurst: () => void;
}

const statusLabels: Record<K8sConnectionStatus, string> = {
  mock: 'Mock',
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
};

export function TopConsole({
  connectionStatus,
  pendingCount,
  failedCount,
  onBurst,
}: TopConsoleProps) {
  return (
    <header className="flex shrink-0 flex-col gap-3 rounded-lg border border-white/10 bg-zinc-950/78 p-3 shadow-glow backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md border border-teal-300/30 bg-teal-300/10 text-teal-200">
          <Activity size={20} />
        </div>
        <div>
          <h1 className="text-base font-semibold text-zinc-50">Kubernetes 调度器可视化沙箱</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span>队列 {pendingCount}</span>
            <span className="h-1 w-1 rounded-full bg-zinc-600" />
            <span>挂起 {failedCount}</span>
            <span className="h-1 w-1 rounded-full bg-zinc-600" />
            <span className="inline-flex items-center gap-1 text-teal-200">
              <RadioTower size={12} />
              真实 K8s · {statusLabels[connectionStatus]}
            </span>
            <span className="h-1 w-1 rounded-full bg-zinc-600" />
            <span>LLM 调度算法</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={onBurst}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300/40 bg-amber-300/12 px-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20"
        >
          <Zap size={16} />
          创建测试 Pod ×10
        </button>
      </div>
    </header>
  );
}
