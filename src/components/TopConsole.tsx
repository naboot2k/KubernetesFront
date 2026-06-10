import { Activity, Gauge, Pause, Play, RadioTower, Zap } from 'lucide-react';
import type { K8sConnectionStatus, RuntimeMode, SchedulerStrategy } from '../types/scheduler';

interface TopConsoleProps {
  mode: RuntimeMode;
  connectionStatus: K8sConnectionStatus;
  enabled: boolean;
  intervalMs: number;
  strategy: SchedulerStrategy;
  pendingCount: number;
  failedCount: number;
  onModeChange: (mode: RuntimeMode) => void;
  onToggle: () => void;
  onIntervalChange: (value: number) => void;
  onBurst: () => void;
  onStrategyChange: (strategy: SchedulerStrategy) => void;
}

const strategies: SchedulerStrategy[] = ['LeastRequested', 'MostRequested'];

const modeLabels: Record<RuntimeMode, string> = {
  mock: '模拟沙箱',
  k8s: '真实 K8s',
};

const statusLabels: Record<K8sConnectionStatus, string> = {
  mock: 'Mock',
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
};

export function TopConsole({
  mode,
  connectionStatus,
  enabled,
  intervalMs,
  strategy,
  pendingCount,
  failedCount,
  onModeChange,
  onToggle,
  onIntervalChange,
  onBurst,
  onStrategyChange,
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
            <span>{mode === 'mock' ? `${intervalMs}ms / pod` : statusLabels[connectionStatus]}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        <div className="inline-flex h-10 overflow-hidden rounded-md border border-white/10 bg-white/[0.04] p-1">
          {(['mock', 'k8s'] as RuntimeMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onModeChange(item)}
              className={`inline-flex items-center gap-1 rounded px-3 text-xs font-semibold transition ${
                mode === item ? 'bg-emerald-300 text-zinc-950' : 'text-zinc-300 hover:bg-white/10'
              }`}
            >
              {item === 'k8s' ? <RadioTower size={13} /> : null}
              {modeLabels[item]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onToggle}
          disabled={mode === 'k8s'}
          className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
            enabled
              ? 'border-emerald-300/45 bg-emerald-400/15 text-emerald-100'
              : 'border-white/10 bg-white/5 text-zinc-200 hover:border-teal-300/40'
          } ${mode === 'k8s' ? 'cursor-not-allowed opacity-45' : ''}`}
        >
          {enabled ? <Pause size={16} /> : <Play size={16} />}
          实时流量
        </button>

        <label className={`flex h-10 min-w-64 items-center gap-3 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-300 ${mode === 'k8s' ? 'opacity-45' : ''}`}>
          <Gauge size={16} className="text-amber-200" />
          <span className="whitespace-nowrap">流量速度</span>
          <input
            disabled={mode === 'k8s'}
            type="range"
            min={500}
            max={5000}
            step={100}
            value={intervalMs}
            onChange={(event) => onIntervalChange(Number(event.currentTarget.value))}
            className="h-1.5 min-w-28 flex-1 accent-teal-300"
          />
        </label>

        <div className="inline-flex h-10 overflow-hidden rounded-md border border-white/10 bg-white/[0.04] p-1">
          {strategies.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onStrategyChange(item)}
              className={`rounded px-3 text-xs font-semibold transition ${
                strategy === item ? 'bg-teal-300 text-zinc-950' : 'text-zinc-300 hover:bg-white/10'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onBurst}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300/40 bg-amber-300/12 px-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20"
        >
          <Zap size={16} />
          {mode === 'k8s' ? '创建测试 Pod ×10' : '手动突发 ×10'}
        </button>
      </div>
    </header>
  );
}
