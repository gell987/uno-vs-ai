"use client";

import { AnimatePresence, motion } from "motion/react";
import { CARD_HEX, ColorShape, PlayingCard } from "@/components/cards/PlayingCard";
import { COLOR_LABEL, type CardId, type Color, type Direction } from "@/lib/uno";

/** Stable pseudo-random tilt per card so the pile looks tossed but never jitters. */
function tilt(id: CardId): { rotate: number; x: number; y: number } {
  const h = Math.imul(id + 17, 2654435761) >>> 0;
  return { rotate: ((h % 29) - 14) * 0.9, x: ((h >> 5) % 9) - 4, y: ((h >> 9) % 7) - 3 };
}

export function DirectionRing({ direction }: { direction: Direction }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <svg
        viewBox="0 0 200 200"
        className="h-[min(118%,340px)] w-[min(118%,340px)] animate-spin-slow opacity-35"
        style={{ animationDirection: direction === 1 ? "normal" : "reverse" }}
      >
        <circle cx="100" cy="100" r="88" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="4 7" />
        {[0, 120, 240].map((a) => (
          <g key={a} transform={`rotate(${a} 100 100)`}>
            <path
              d={direction === 1 ? "M100 6 l9 6 -9 6" : "M100 6 l-9 6 9 6"}
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function DrawPile({
  topIds,
  count,
  canDraw,
  suggest,
  onDraw,
  label,
}: {
  topIds: CardId[];
  count: number;
  canDraw: boolean;
  /** Draw attention to the pile (drawing is the only sensible move). */
  suggest: boolean;
  onDraw: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onDraw}
      aria-label={label}
      aria-disabled={!canDraw}
      className={`group relative w-[var(--card-w)] rounded-[10.8%/7.2%] outline-offset-4 ${canDraw ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="aspect-[2/3]" />
      {count > 2 && (
        <div className="absolute inset-0 translate-x-[5px] translate-y-[5px]">
          <PlayingCard faceDown className="brightness-75" />
        </div>
      )}
      {count > 1 && (
        <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px]">
          <PlayingCard faceDown className="brightness-90" />
        </div>
      )}
      {topIds.map((id, i) => (
        <motion.div
          key={id}
          layoutId={`card-${id}`}
          className="absolute inset-0"
          style={{ zIndex: i + 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        >
          <PlayingCard faceDown className={canDraw && i === topIds.length - 1 ? "transition group-hover:-translate-y-1.5" : ""} />
        </motion.div>
      ))}
      {canDraw && suggest && <div className="pointer-events-none absolute -inset-1 z-10 animate-pulse-ring rounded-[12%/8%]" />}
      <span className="absolute -bottom-2.5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-white/90">
        {count}
      </span>
    </button>
  );
}

export function DiscardPile({
  ids,
  activeColor,
  pendingDraw,
  colorblind,
}: {
  ids: CardId[];
  activeColor: Color | null;
  pendingDraw: number;
  colorblind: boolean;
}) {
  const visible = ids.slice(-6);
  const glow = activeColor ? CARD_HEX[activeColor] : "#ffffff";
  return (
    <div className="relative w-[var(--card-w)]" aria-live="polite">
      <div
        className="absolute -inset-5 rounded-full opacity-60 blur-2xl transition-colors duration-500"
        style={{ background: glow }}
        aria-hidden="true"
      />
      <div className="aspect-[2/3]" />
      {visible.map((id, i) => {
        const t = tilt(id);
        const isTop = i === visible.length - 1;
        return (
          <motion.div
            key={id}
            layoutId={`card-${id}`}
            className="absolute inset-0"
            style={{ zIndex: i + 1 }}
            initial={false}
            animate={{ rotate: isTop ? t.rotate * 0.5 : t.rotate, x: t.x, y: t.y }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <PlayingCard cardId={id} colorblind={colorblind} />
          </motion.div>
        );
      })}
      {activeColor && (
        <div className="absolute -bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/70 px-2.5 py-0.5 text-xs font-semibold">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CARD_HEX[activeColor] }} />
          {colorblind && (
            <svg viewBox="0 0 20 20" className="h-3 w-3" aria-hidden="true">
              <ColorShape color={activeColor} x={10} y={10} size={12} />
            </svg>
          )}
          {COLOR_LABEL[activeColor]}
        </div>
      )}
      <AnimatePresence>
        {pendingDraw > 0 && (
          <motion.div
            key={pendingDraw}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            className="font-display absolute -right-5 -top-4 z-30 rounded-full bg-rose-600 px-2.5 py-1 text-lg text-white shadow-lg ring-2 ring-white/80"
            aria-label={`${pendingDraw} cards pending`}
          >
            +{pendingDraw}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
