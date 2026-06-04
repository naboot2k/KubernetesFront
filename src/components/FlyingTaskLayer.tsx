import { MutableRefObject, RefObject, useLayoutEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { ActiveFlight } from '../types/scheduler';

interface FlightPath {
  startX: number;
  startY: number;
  midX: number;
  midY: number;
  endX: number;
  endY: number;
}

interface FlyingTaskLayerProps {
  activeFlight: ActiveFlight | null;
  brokerRef: RefObject<HTMLDivElement | null>;
  nodeRefs: MutableRefObject<Map<string, HTMLElement>>;
  onComplete: (flightId: string) => void;
}

const CARD_WIDTH = 156;
const CARD_HEIGHT = 64;

export function FlyingTaskLayer({ activeFlight, brokerRef, nodeRefs, onComplete }: FlyingTaskLayerProps) {
  const [path, setPath] = useState<FlightPath | null>(null);

  useLayoutEffect(() => {
    if (!activeFlight) {
      setPath(null);
      return;
    }

    const source = brokerRef.current?.getBoundingClientRect();
    const target = nodeRefs.current.get(activeFlight.targetNodeId)?.getBoundingClientRect();
    const fallbackX = window.innerWidth / 2 - CARD_WIDTH / 2;
    const fallbackY = window.innerHeight / 2 - CARD_HEIGHT / 2;

    const startX = source ? source.left + source.width / 2 - CARD_WIDTH / 2 : fallbackX;
    const startY = source ? source.top + source.height / 2 - CARD_HEIGHT / 2 : fallbackY;
    const endX = target ? target.left + target.width / 2 - CARD_WIDTH / 2 : fallbackX;
    const endY = target ? target.top + Math.min(target.height - CARD_HEIGHT - 18, 118) : fallbackY;
    const midX = (startX + endX) / 2;
    const midY = Math.min(startY, endY) - 92;

    setPath({ startX, startY, midX, midY, endX, endY });
  }, [activeFlight, brokerRef, nodeRefs]);

  if (!activeFlight || !path) return null;

  return (
    <motion.div
      key={activeFlight.id}
      className="pointer-events-none fixed left-0 top-0 z-50 rounded-md border border-teal-200/70 bg-zinc-950/95 p-3 shadow-glow"
      style={{ width: CARD_WIDTH }}
      initial={{ x: path.startX, y: path.startY, scale: 1, opacity: 0.98 }}
      animate={{
        x: [path.startX, path.midX, path.endX],
        y: [path.startY, path.midY, path.endY],
        scale: [1, 1.08, 0.66],
        opacity: [1, 1, 0.28],
      }}
      transition={{ duration: 0.76, ease: 'easeInOut' }}
      onAnimationComplete={() => onComplete(activeFlight.id)}
    >
      <div className="truncate font-mono text-xs font-semibold text-teal-100">{activeFlight.task.name}</div>
      <div className="mt-2 flex gap-2 font-mono text-[11px] text-zinc-300">
        <span>CPU {activeFlight.task.reqCpu}</span>
        <span>MEM {activeFlight.task.reqMem}G</span>
      </div>
    </motion.div>
  );
}
