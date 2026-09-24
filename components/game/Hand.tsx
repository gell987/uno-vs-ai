"use client";

import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { DECK, cardName, type CardId } from "@/lib/uno";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, viewportHeight: 800 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.getBoundingClientRect().width, viewportHeight: window.innerHeight });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return { ref, ...size };
}

export interface HandProps {
  cards: CardId[];
  /** Cards that may be played right now. */
  playable: ReadonlySet<CardId>;
  /** It's the human's turn and cards can be clicked. */
  active: boolean;
  /** Dim unplayable cards and lift playable ones. */
  showHints: boolean;
  /** Emphasized card (a playable drawn card, or the hint). */
  focusId: CardId | null;
  shakeId: CardId | null;
  colorblind: boolean;
  onPlay: (id: CardId) => void;
}

export function Hand({ cards, playable, active, showHints, focusId, shakeId, colorblind, onPlay }: HandProps) {
  const { ref, width, viewportHeight } = useSize<HTMLDivElement>();
  const n = cards.length;
  // Big enough to read, small enough to leave room for the table on short screens.
  const minW = viewportHeight < 520 ? 46 : 56;
  const maxByHeight = Math.max(minW, Math.min(108, (viewportHeight * 0.19) / 1.5));
  const cardW = Math.round(Math.min(maxByHeight, Math.max(minW, width * 0.105)));
  const maxStep = cardW * 0.8;
  const step = n > 1 ? Math.max(8, Math.min(maxStep, (width - cardW - 16) / (n - 1))) : 0;
  const total = cardW + step * Math.max(0, n - 1);
  const left0 = Math.max(0, (width - total) / 2);
  const mid = (n - 1) / 2;
  const spread = n > 1 ? Math.min(3.2, 34 / n) : 0;
  const cardH = cardW * 1.5;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-card]"));
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = buttons[(i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
    next?.focus();
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={`Your hand, ${n} card${n === 1 ? "" : "s"}`}
      onKeyDown={onKeyDown}
      className="relative mx-auto w-full"
      style={{ height: cardH + (viewportHeight < 520 ? 30 : 40) }}
    >
      {width > 0 &&
        cards.map((id, i) => {
          const canPlay = active && playable.has(id);
          const emphasized = focusId === id;
          const dim = showHints && active && !canPlay;
          const lift = (showHints && canPlay ? 12 : 0) + (emphasized ? 16 : 0);
          const offset = i - mid;
          const arc = Math.abs(offset) * Math.abs(offset) * (spread * 0.45);
          return (
            <motion.button
              key={id}
              data-card={id}
              layoutId={`card-${id}`}
              type="button"
              aria-label={`${cardName(DECK[id])}${canPlay ? "" : " (not playable now)"}`}
              aria-disabled={!canPlay}
              onClick={() => onPlay(id)}
              className={`absolute bottom-5 cursor-pointer short:bottom-3 rounded-[10.8%/7.2%] outline-offset-4 ${shakeId === id ? "animate-shake" : ""}`}
              style={{ left: left0 + step * i, width: cardW, zIndex: emphasized ? 60 : i + 1, transformOrigin: "50% 120%" }}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, rotate: offset * spread, y: arc - lift }}
              whileHover={active ? { y: arc - lift - 18, scale: 1.05, zIndex: 70 } : undefined}
              whileFocus={{ y: arc - lift - 18, scale: 1.05 }}
              whileTap={canPlay ? { scale: 0.97 } : undefined}
              transition={{ type: "spring", stiffness: 480, damping: 34, mass: 0.8 }}
            >
              <PlayingCard
                cardId={id}
                colorblind={colorblind}
                className={`transition-[filter] duration-200 ${dim ? "brightness-[0.62] saturate-[0.75]" : ""} ${
                  emphasized ? "ring-4 ring-amber-300 ring-offset-2 ring-offset-transparent" : canPlay && showHints ? "ring-2 ring-white/70" : ""
                }`}
              />
            </motion.button>
          );
        })}
    </div>
  );
}
