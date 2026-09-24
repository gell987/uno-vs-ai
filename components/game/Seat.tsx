"use client";

import { AnimatePresence, motion } from "motion/react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { Avatar } from "@/components/ui/Avatar";
import { PERSONAS } from "@/lib/ai";
import type { MatchState, PlayerIndex } from "@/lib/uno";

const MAX_BACKS = 12;

export function Seat({
  match,
  player,
  active,
  thinking,
  bubble,
  vulnerable,
  onCatch,
  compact,
}: {
  match: MatchState;
  player: PlayerIndex;
  active: boolean;
  thinking: boolean;
  bubble: string | null;
  vulnerable: boolean;
  onCatch: () => void;
  compact: boolean;
}) {
  const cfg = match.config.players[player];
  const hand = match.round.hands[player];
  const persona = PERSONAS[cfg.difficulty];
  const saidUno = match.round.unoCalled[player] && hand.length === 1;
  const shown = hand.slice(0, MAX_BACKS);
  const extra = hand.length - shown.length;
  const backW = compact ? 22 : 30;
  const step = Math.max(5, Math.min(backW * 0.55, (compact ? 120 : 190) / Math.max(1, shown.length)));

  return (
    <div
      className={`glass relative flex min-w-0 flex-col items-center rounded-2xl px-2.5 pb-2 pt-2 transition-shadow short:py-1 sm:px-3 ${
        active ? "shadow-[0_0_0_2px_#fcd34d,0_0_28px_rgb(252_211_77/0.35)]" : ""
      }`}
      aria-label={`${cfg.name}, ${persona.title}, ${hand.length} card${hand.length === 1 ? "" : "s"}${saidUno ? ", called UNO" : ""}`}
    >
      <div className="flex w-full min-w-0 items-center gap-2">
        <div className="relative shrink-0">
          <Avatar difficulty={cfg.difficulty} seat={player} size={compact ? 32 : 40} />
          {compact && (
            <span
              className={`absolute -bottom-1 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums ring-2 ring-black/40 ${
                hand.length <= 2 ? "bg-rose-500 text-white" : "bg-slate-700 text-white"
              }`}
              aria-hidden="true"
            >
              {hand.length}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight sm:text-[15px]">{cfg.name}</div>
          <div className="truncate text-[11px] leading-tight text-white/60 sm:text-xs">
            {persona.title}
            {match.config.targetScore > 0 && <> · {match.scores[player]} pts</>}
          </div>
        </div>
        {!compact && (
          <div
            className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold tabular-nums ${
              hand.length <= 2 ? "bg-rose-500 text-white" : "bg-white/15 text-white"
            }`}
            aria-hidden="true"
          >
            {hand.length}
          </div>
        )}
      </div>

      <div
        className="relative mt-1.5 flex h-[var(--h)] w-full items-end justify-center short:hidden"
        style={{ ["--h" as string]: `${backW * 1.5 + 4}px` }}
      >
        <div className="relative" style={{ width: backW + step * Math.max(0, shown.length - 1), height: backW * 1.5 }}>
          {shown.map((id, i) => (
            <motion.div
              key={id}
              layoutId={`card-${id}`}
              className="absolute bottom-0"
              style={{ left: i * step, width: backW, zIndex: i }}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0, rotate: (i - (shown.length - 1) / 2) * 2.5 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            >
              <PlayingCard faceDown />
            </motion.div>
          ))}
        </div>
        {extra > 0 && <span className="ml-1 self-center text-xs font-semibold text-white/70">+{extra}</span>}
      </div>

      {thinking && (
        <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/60 px-2 py-1" aria-label="thinking">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 animate-bob rounded-full bg-amber-200" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {saidUno && (
          <motion.div
            key="uno"
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: -8 }}
            exit={{ scale: 0 }}
            className="font-display absolute -right-2 -top-3 rounded-lg bg-gradient-to-b from-[#ff5a4f] to-[#c81e1e] px-2 py-0.5 text-sm text-white shadow-lg"
          >
            UNO!
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {vulnerable && (
          <motion.button
            key="catch"
            type="button"
            onClick={onCatch}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            className="font-display absolute -bottom-4 left-1/2 z-20 -translate-x-1/2 animate-pulse-ring whitespace-nowrap rounded-full bg-amber-300 px-3 py-1 text-sm text-amber-950 shadow-lg"
            aria-label={`Catch ${cfg.name}: they didn't call UNO`}
          >
            Catch! <span className="font-sans text-xs font-bold">(C)</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bubble && (
          <motion.div
            key={bubble}
            role="status"
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-1/2 top-full z-30 mt-3 w-max max-w-[220px] -translate-x-1/2 rounded-2xl bg-white px-3 py-2 text-center text-[13px] font-medium leading-snug text-slate-900 shadow-xl short:left-full short:top-1/2 short:ml-3 short:mt-0 short:-translate-y-1/2 short:translate-x-0"
          >
            <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white short:hidden" />
            <span className="relative">{bubble}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
