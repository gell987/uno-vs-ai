"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { Avatar } from "@/components/ui/Avatar";
import { Button, Segmented, Toggle } from "@/components/ui/primitives";
import { AI_NAMES, PERSONAS } from "@/lib/ai";
import type { Setup } from "@/lib/game/settings";
import type { Stats } from "@/lib/game/stats";
import {
  DECK,
  DIFFICULTIES,
  HOUSE_RULES,
  OFFICIAL_RULES,
  detectPreset,
  normalizeRules,
  type Difficulty,
  type MatchState,
  type Rules,
} from "@/lib/uno";

const HERO_CARDS = [
  DECK.find((c) => c.color === "red" && c.rank === "7")!.id,
  DECK.find((c) => c.color === "blue" && c.rank === "reverse")!.id,
  DECK.find((c) => c.rank === "wild4")!.id,
  DECK.find((c) => c.color === "green" && c.rank === "skip")!.id,
  DECK.find((c) => c.color === "yellow" && c.rank === "draw2")!.id,
];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-3xl p-4 sm:p-5">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-white/60">{title}</h2>
      {children}
    </section>
  );
}

export function Lobby({
  setup,
  onSetup,
  onPlay,
  saved,
  onContinue,
  stats,
  onOpenRules,
  onOpenSettings,
  onOpenStats,
  felt,
}: {
  setup: Setup;
  onSetup: (s: Setup) => void;
  onPlay: () => void;
  saved: MatchState | null;
  onContinue: () => void;
  stats: Stats;
  onOpenRules: () => void;
  onOpenSettings: () => void;
  onOpenStats: () => void;
  felt: string;
}) {
  const [customOpen, setCustomOpen] = useState(detectPreset(setup.rules) === "custom");
  const preset = detectPreset(setup.rules);
  const setRules = (patch: Partial<Rules>) => onSetup({ ...setup, rules: normalizeRules({ ...setup.rules, ...patch }) });
  const setOpponentCount = (n: number) => {
    const next = setup.opponents.slice(0, n);
    while (next.length < n) next.push(next[next.length - 1] ?? "shark");
    onSetup({ ...setup, opponents: next });
  };
  const setDifficulty = (i: number, d: Difficulty) => {
    const next = setup.opponents.slice();
    next[i] = d;
    onSetup({ ...setup, opponents: next });
  };
  const savedLabel =
    saved && !saved.over
      ? `Round ${saved.roundNumber} vs ${saved.config.players
          .slice(1)
          .map((p) => p.name)
          .join(", ")}`
      : null;

  return (
    <div className="felt relative min-h-dvh overflow-x-hidden" data-felt={felt}>
      <div className="vignette pointer-events-none fixed inset-0" aria-hidden="true" />
      <div className="relative mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 lg:pt-10">
        <header className="flex flex-col items-center text-center">
          <div className="relative mb-4 h-32 w-72 sm:h-40 sm:w-96" aria-hidden="true">
            {HERO_CARDS.map((id, i) => {
              const offset = i - 2;
              return (
                <motion.div
                  key={id}
                  className="absolute left-1/2 top-2 w-[70px] sm:w-[88px]"
                  initial={{ opacity: 0, y: 40, rotate: 0, x: "-50%" }}
                  animate={{ opacity: 1, y: Math.abs(offset) * 9, rotate: offset * 12, x: `calc(-50% + ${offset * 44}px)` }}
                  transition={{ delay: 0.1 + i * 0.07, type: "spring", stiffness: 180, damping: 18 }}
                  style={{ transformOrigin: "50% 120%" }}
                >
                  <PlayingCard cardId={id} />
                </motion.div>
              );
            })}
          </div>
          <h1 className="font-display text-shadow text-5xl sm:text-7xl">
            UNO <span className="text-amber-300">vs AI</span>
          </h1>
          <p className="mt-3 max-w-xl text-balance text-[15px] text-white/75 sm:text-lg">
            Take on opponents that count cards, read your hand from what you draw, and play out thousands of possible futures before every move.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Panel title="Opponents">
            <div className="mb-4">
              <Segmented
                label="Number of opponents"
                value={setup.opponents.length}
                onChange={setOpponentCount}
                options={[1, 2, 3].map((n) => ({ value: n, label: `${n} opponent${n > 1 ? "s" : ""}` }))}
              />
            </div>
            <div className="space-y-3">
              {setup.opponents.map((d, i) => (
                <div key={i} className="rounded-2xl bg-black/20 p-3">
                  <div className="mb-2 flex items-center gap-3">
                    <Avatar difficulty={d} seat={i + 1} size={38} />
                    <div className="min-w-0">
                      <div className="font-semibold">{AI_NAMES[i]}</div>
                      <div className="truncate text-xs text-white/60">{PERSONAS[d].tagline}</div>
                    </div>
                  </div>
                  <Segmented
                    label={`${AI_NAMES[i]} difficulty`}
                    value={d}
                    onChange={(v) => setDifficulty(i, v)}
                    options={DIFFICULTIES.map((x) => ({ value: x, label: PERSONAS[x].title, title: PERSONAS[x].description }))}
                  />
                  <p className="mt-2 text-[13px] leading-snug text-white/60">{PERSONAS[d].description}</p>
                </div>
              ))}
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel title="Match">
              <label className="mb-3 block">
                <span className="mb-1 block text-sm text-white/70">Your name</span>
                <input
                  value={setup.playerName}
                  maxLength={16}
                  onChange={(e) => onSetup({ ...setup, playerName: e.target.value })}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white placeholder:text-white/40 focus:border-amber-300 focus:outline-none"
                  placeholder="You"
                />
              </label>
              <span className="mb-1 block text-sm text-white/70">Length</span>
              <Segmented
                label="Match length"
                value={setup.targetScore}
                onChange={(v) => onSetup({ ...setup, targetScore: v })}
                options={[
                  { value: 0, label: "1 round" },
                  { value: 100, label: "100 pts" },
                  { value: 250, label: "250 pts" },
                  { value: 500, label: "500 pts", title: "Official match length" },
                ]}
              />
            </Panel>

            <Panel title="Rules">
              <Segmented
                label="Rules preset"
                value={preset}
                onChange={(v) => {
                  if (v === "official") onSetup({ ...setup, rules: { ...OFFICIAL_RULES } });
                  else if (v === "house") onSetup({ ...setup, rules: { ...HOUSE_RULES } });
                  setCustomOpen(v === "custom" || customOpen);
                }}
                options={[
                  { value: "official", label: "Official" },
                  { value: "house", label: "House party" },
                  { value: "custom", label: "Custom" },
                ]}
              />
              <button
                type="button"
                onClick={() => setCustomOpen((v) => !v)}
                className="mt-3 text-sm font-semibold text-amber-200 hover:text-amber-100"
                aria-expanded={customOpen}
              >
                {customOpen ? "Hide rule details" : "Show rule details"}
              </button>
              {customOpen && (
                <div className="mt-2 divide-y divide-white/10">
                  <Toggle
                    label="Challenge Wild Draw Fours"
                    description="Official: a +4 is only legal without a card of the current color. Call a bluff to make them draw 4, or draw 6 if you're wrong."
                    checked={setup.rules.challenges}
                    disabled={setup.rules.stacking}
                    onChange={(v) => setRules({ challenges: v })}
                  />
                  <Toggle
                    label="Stacking"
                    description="Answer a +2 with a +2 (or +4) to pass the growing penalty along."
                    checked={setup.rules.stacking}
                    onChange={(v) => setRules({ stacking: v, challenges: v ? false : setup.rules.challenges })}
                  />
                  <Toggle
                    label="Draw until playable"
                    description="Keep drawing until you get a card you can play."
                    checked={setup.rules.drawUntilPlayable}
                    onChange={(v) => setRules({ drawUntilPlayable: v })}
                  />
                  <Toggle
                    label="Seven-O"
                    description="A 7 swaps hands with a player of your choice; a 0 passes every hand along."
                    checked={setup.rules.sevenZero}
                    onChange={(v) => setRules({ sevenZero: v })}
                  />
                </div>
              )}
            </Panel>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
            <Button variant="primary" size="lg" className="flex-1" onClick={onPlay} autoFocus>
              Deal me in
            </Button>
            {savedLabel && (
              <Button variant="secondary" size="lg" className="flex-1" onClick={onContinue} title={savedLabel}>
                Continue
              </Button>
            )}
          </div>
          {savedLabel && <p className="text-xs text-white/50">Saved game: {savedLabel}</p>}
          <nav className="mt-1 flex flex-wrap justify-center gap-2" aria-label="More">
            <Button variant="ghost" size="sm" onClick={onOpenRules}>
              How to play
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpenStats}>
              Stats{stats.roundsPlayed > 0 ? ` · ${Math.round((stats.roundsWon / stats.roundsPlayed) * 100)}% won` : ""}
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpenSettings}>
              Settings
            </Button>
          </nav>
        </div>

        <footer className="text-center text-xs text-white/40">
          Unofficial fan project. UNO is a trademark of Mattel; this game is not affiliated with or endorsed by Mattel.
        </footer>
      </div>
    </div>
  );
}
