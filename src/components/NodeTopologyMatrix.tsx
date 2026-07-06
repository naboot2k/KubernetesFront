import { motion } from 'framer-motion';
import { Server, Trash2 } from 'lucide-react';
import type { ClusterNode, NodeTelemetry } from '../types/scheduler';
import { clamp, formatResourceValue, percent } from '../utils/format';

interface NodeTopologyMatrixProps {
  nodes: ClusterNode[];
  telemetry: Record<string, NodeTelemetry>;
  registerNodeRef: (nodeId: string, element: HTMLElement | null) => void;
  onRemovePod: (nodeId: string, taskId: string) => void;
}

interface ResourceBarProps {
  label: string;
  used: number;
  observed?: number;
  capacity: number;
  noise: number;
  unit: string;
  tone: 'cpu' | 'mem';
}

function ResourceBar({ label, used, observed, capacity, noise, unit, tone }: ResourceBarProps) {
  const hasLiveMetric = observed !== undefined;
  const displayed = clamp(hasLiveMetric ? observed : used + noise, 0, capacity);
  const value = percent(displayed, capacity);
  const gradient = tone === 'cpu' ? 'from-teal-300 to-emerald-400' : 'from-amber-300 to-rose-400';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-zinc-400">
        <span>
          {label}
          {hasLiveMetric ? <span className="ml-1 text-emerald-300">live</span> : <span className="ml-1 text-zinc-600">requests</span>}
        </span>
        <span className="min-w-0 truncate">
          {formatResourceValue(displayed)} / {formatResourceValue(capacity)}
          {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
          animate={{ width: `${value}%` }}
          transition={{ type: 'spring', stiffness: 150, damping: 24 }}
        />
      </div>
    </div>
  );
}

function podNamespace(podId: string) {
  return podId.split('/')[0] ?? 'default';
}

export function NodeTopologyMatrix({
  nodes,
  telemetry,
  registerNodeRef,
  onRemovePod,
}: NodeTopologyMatrixProps) {
  return (
    <section className="flex min-h-[620px] flex-col rounded-lg border border-white/10 bg-zinc-950/76 backdrop-blur xl:min-h-0">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-50">Node Topology Matrix</h2>
          <p className="mt-1 text-xs text-zinc-500">{nodes.length} 个物理节点 · 实时资源视图</p>
        </div>
        <span className="rounded border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 font-mono text-xs text-emerald-100">
          Ready
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 2xl:grid-cols-2">
        {nodes.map((node) => {
          const signal = telemetry[node.id] ?? { cpuNoise: 0, memNoise: 0 };
          const totalPods = node.podCount ?? node.pods.length;
          const visiblePods = node.pods.length;

          return (
            <motion.article
              layout
              key={node.id}
              ref={(element) => registerNodeRef(node.id, element)}
              className="flex min-h-[250px] flex-col rounded-lg border border-white/10 bg-white/[0.045] p-3 transition hover:border-teal-300/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-teal-300/25 bg-teal-300/10 text-teal-100">
                    <Server size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-semibold text-zinc-100">{node.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {node.role} · {node.zone}
                    </div>
                  </div>
                </div>
                <span className="rounded border border-white/10 bg-zinc-950/60 px-2 py-1 font-mono text-xs text-zinc-300">
                  pods {totalPods}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <ResourceBar
                  label="CPU"
                  used={node.usedCpu}
                  observed={node.observedCpu}
                  capacity={node.capacityCpu}
                  noise={signal.cpuNoise}
                  unit="c"
                  tone="cpu"
                />
                <ResourceBar
                  label="MEM"
                  used={node.usedMem}
                  observed={node.observedMem}
                  capacity={node.capacityMem}
                  noise={signal.memNoise}
                  unit="G"
                  tone="mem"
                />
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-md border border-white/8 bg-zinc-950/44 p-2">
                {node.pods.length === 0 ? (
                  <div className="grid h-full min-h-20 place-items-center text-xs text-zinc-600">no resident pods</div>
                ) : (
                  <div className="space-y-2">
                    {visiblePods < totalPods ? (
                      <div className="font-mono text-[11px] text-zinc-500">
                        showing {visiblePods}/{totalPods}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {node.pods.map((pod) => (
                        <button
                          type="button"
                          key={pod.id}
                          title={`删除 Pod: ${pod.id}`}
                          onClick={() => onRemovePod(node.id, pod.id)}
                          className="group inline-flex max-w-full items-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 py-1 font-mono text-[11px] text-zinc-200 transition hover:border-rose-300/40 hover:bg-rose-300/12"
                        >
                          <span className="max-w-36 truncate">
                            <span className="text-zinc-500">{podNamespace(pod.id)}/</span>
                            {pod.name}
                          </span>
                          <span className="text-zinc-500">
                            {pod.reqCpu}c/{pod.reqMem}G
                          </span>
                          <Trash2 size={11} className="text-zinc-500 group-hover:text-rose-200" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
