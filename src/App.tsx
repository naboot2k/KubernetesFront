import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTaskBurst } from './data/tasks';
import { initialNodes } from './data/cluster';
import { useSchedulerEngine } from './hooks/useSchedulerEngine';
import { useTaskIngestion } from './hooks/useTaskIngestion';
import { FailedQueue } from './components/FailedQueue';
import { FlyingTaskLayer } from './components/FlyingTaskLayer';
import { LiveBroker } from './components/LiveBroker';
import { LiveQueue } from './components/LiveQueue';
import { NodeTopologyMatrix } from './components/NodeTopologyMatrix';
import { TerminalLog } from './components/TerminalLog';
import { TopConsole } from './components/TopConsole';
import type { ClusterNode, LogEntry, LogTone, NodeTelemetry, SchedulerStrategy, Task } from './types/scheduler';

interface LogPayload {
  message: string;
  tone?: LogTone;
}

function createLog(message: string, tone: LogTone = 'info'): LogEntry {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  return {
    id: randomId,
    timestamp: Date.now(),
    tone,
    message,
  };
}

function formatIngress(task: Task) {
  return `📥 实时收到新任务: ${task.name} (CPU: ${task.reqCpu}, Mem: ${task.reqMem}G)`;
}

function createTelemetry(nodes: ClusterNode[]): Record<string, NodeTelemetry> {
  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      {
        cpuNoise: Number((Math.random() * 0.9).toFixed(1)),
        memNoise: Number((Math.random() * 3.6).toFixed(1)),
      },
    ]),
  );
}

export default function App() {
  const [trafficEnabled, setTrafficEnabled] = useState(false);
  const [intervalMs, setIntervalMs] = useState(1400);
  const [strategy, setStrategy] = useState<SchedulerStrategy>('LeastRequested');
  const [pendingQueue, setPendingQueue] = useState<Task[]>([]);
  const [nodes, setNodes] = useState<ClusterNode[]>(initialNodes);
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    createLog('系统就绪: Scheduler sandbox initialized', 'muted'),
  ]);
  const [now, setNow] = useState(Date.now());
  const [telemetry, setTelemetry] = useState<Record<string, NodeTelemetry>>(() => createTelemetry(initialNodes));

  const brokerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());

  const appendLog = useCallback(({ message, tone = 'info' }: LogPayload) => {
    setLogs((current) => [...current.slice(-179), createLog(message, tone)]);
  }, []);

  const ingestTask = useCallback(
    (task: Task) => {
      setPendingQueue((current) => [...current, task]);
      appendLog({ message: formatIngress(task), tone: 'info' });
    },
    [appendLog],
  );

  useTaskIngestion({
    enabled: trafficEnabled,
    intervalMs,
    onTask: ingestTask,
  });

  const scheduler = useSchedulerEngine({
    pendingQueue,
    setPendingQueue,
    nodes,
    setNodes,
    strategy,
    onLog: appendLog,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTelemetry(createTelemetry(nodes));
    }, 900);

    return () => window.clearInterval(timer);
  }, [nodes]);

  const registerNodeRef = useCallback((nodeId: string, element: HTMLElement | null) => {
    if (element) {
      nodeRefs.current.set(nodeId, element);
      return;
    }

    nodeRefs.current.delete(nodeId);
  }, []);

  const handleBurst = useCallback(() => {
    const burst = createTaskBurst(10);

    setPendingQueue((current) => [...current, ...burst]);
    setLogs((current) => [
      ...current.slice(-169),
      createLog('⚡ 手动突发: 10 个高并发任务同时涌入', 'warning'),
      ...burst.map((task) => createLog(formatIngress(task), 'info')),
    ]);
  }, []);

  const handleRemovePod = useCallback(
    (nodeId: string, taskId: string) => {
      let removed: Task | null = null;

      setNodes((current) =>
        current.map((node) => {
          if (node.id !== nodeId) return node;

          const pod = node.pods.find((item) => item.id === taskId);
          if (!pod) return node;

          removed = pod;

          return {
            ...node,
            usedCpu: Math.max(0, node.usedCpu - pod.reqCpu),
            usedMem: Math.max(0, node.usedMem - pod.reqMem),
            pods: node.pods.filter((item) => item.id !== taskId),
          };
        }),
      );

      window.setTimeout(() => {
        if (!removed) return;

        appendLog({
          message: `🧹 Pod 销毁: ${removed.name} 从 ${nodeId} 释放 CPU ${removed.reqCpu}, Mem ${removed.reqMem}G`,
          tone: 'muted',
        });
      }, 0);
    },
    [appendLog],
  );

  const totalCapacity = useMemo(
    () =>
      nodes.reduce(
        (sum, node) => ({
          cpu: sum.cpu + node.capacityCpu,
          mem: sum.mem + node.capacityMem,
          usedCpu: sum.usedCpu + node.usedCpu,
          usedMem: sum.usedMem + node.usedMem,
        }),
        { cpu: 0, mem: 0, usedCpu: 0, usedMem: 0 },
      ),
    [nodes],
  );

  return (
    <main className="flex min-h-screen flex-col gap-3 overflow-y-auto p-3 text-zinc-100 md:p-4 xl:h-screen xl:min-h-0 xl:overflow-hidden">
      <TopConsole
        enabled={trafficEnabled}
        intervalMs={intervalMs}
        strategy={strategy}
        pendingCount={pendingQueue.length}
        failedCount={scheduler.failedTasks.length}
        onToggle={() => setTrafficEnabled((enabled) => !enabled)}
        onIntervalChange={setIntervalMs}
        onBurst={handleBurst}
        onStrategyChange={setStrategy}
      />

      <div className="grid flex-none grid-cols-1 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[320px_380px_minmax(460px,1fr)]">
        <LiveQueue queue={pendingQueue} now={now} />

        <div className="flex min-h-0 flex-col gap-3">
          <LiveBroker ref={brokerRef} brokerState={scheduler.brokerState} />
          <FailedQueue
            failedTasks={scheduler.failedTasks}
            now={now}
            onRetry={scheduler.retryFailedTask}
            onDrop={scheduler.dropFailedTask}
          />
        </div>

        <NodeTopologyMatrix
          nodes={nodes}
          telemetry={telemetry}
          registerNodeRef={registerNodeRef}
          onRemovePod={handleRemovePod}
        />
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 xl:grid-cols-[320px_1fr]">
        <section className="hidden rounded-lg border border-white/10 bg-zinc-950/76 p-3 backdrop-blur xl:block">
          <div className="mb-3 text-xs font-semibold text-zinc-400">Cluster Aggregate</div>
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <div className="rounded-md border border-teal-300/20 bg-teal-300/10 p-3 text-teal-100">
              <div className="text-zinc-500">CPU</div>
              <div className="mt-1 text-lg font-semibold">
                {totalCapacity.usedCpu}/{totalCapacity.cpu}c
              </div>
            </div>
            <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
              <div className="text-zinc-500">MEM</div>
              <div className="mt-1 text-lg font-semibold">
                {totalCapacity.usedMem}/{totalCapacity.mem}G
              </div>
            </div>
          </div>
        </section>
        <TerminalLog logs={logs} />
      </div>

      <FlyingTaskLayer
        activeFlight={scheduler.activeFlight}
        brokerRef={brokerRef}
        nodeRefs={nodeRefs}
        onComplete={scheduler.completeFlight}
      />
    </main>
  );
}
