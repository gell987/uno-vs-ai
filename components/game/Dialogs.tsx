"use client";

import { useEffect, useRef } from "react";
import { CARD_HEX, ColorShape, PlayingCard } from "@/components/cards/PlayingCard";
import { Avatar } from "@/components/ui/Avatar";
import { Button, Modal } from "@/components/ui/primitives";
import { HUMAN, nameOf } from "@/lib/game/format";
import { COLORS, COLOR_LABEL, DECK, type CardId, type Color, type MatchState, type PlayerIndex } from "@/lib/uno";

export function ColorPicker({
  open,
  hand,
  exclude,
  onPick,
  onCancel,
  colorblind,
  title = "Pick a color",
}: {
  open: boolean;
  hand: CardId[];
  exclude: CardId | null;
  onPick: (c: Color) => void;
  onCancel?: () => void;
  colorblind: boolean;
  title?: string;
}) {
  const counts = COLORS.map((c) => hand.filter((id) => id !== exclude && DECK[id].color === c).length);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0) {
        e.preventDefault();
        onPick(COLORS[i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onPick]);
  return (
    <Modal open={open} onClose={onCancel} dismissable={!!onCancel} title={title} labelledBy="color-title">
      <div className="grid grid-cols-2 gap-3">
        {COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className="group relative flex h-28 flex-col items-center justify-center rounded-2xl text-white shadow-[inset_0_-6px_0_rgb(0_0_0/0.18)] transition hover:scale-[1.03] hover:brightness-110 active:scale-[0.98] sm:h-32"
            style={{ background: CARD_HEX[c], color: c === "yellow" ? "#422006" : "#fff" }}
          >
            {colorblind && (
              <svg viewBox="0 0 24 24" className="mb-1 h-6 w-6" aria-hidden="true">
                <ColorShape color={c} x={12} y={12} size={14} />
              </svg>
            )}
            <span className="font-display text-2xl">{COLOR_LABEL[c]}</span>
            <span className="text-sm font-semibold opacity-80">
              {counts[i]} in hand
            </span>
            <span className="absolute left-3 top-2 font-mono text-xs opacity-60">{i + 1}</span>
          </button>
        ))}
      </div>
      {onCancel && (
        <Button variant="ghost" className="mt-4 w-full" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </Modal>
  );
}

export function TargetPicker({
  open,
  match,
  onPick,
  onCancel,
}: {
  open: boolean;
  match: MatchState;
  onPick: (p: PlayerIndex) => void;
  onCancel: () => void;
}) {
  const others = match.config.players.map((_, i) => i).filter((i) => i !== HUMAN);
  return (
    <Modal open={open} onClose={onCancel} title="Swap hands with…" labelledBy="swap-title">
      <p className="mb-4 text-sm text-white/70">Your 7 lets you trade your remaining hand for someone else&apos;s.</p>
      <div className="grid gap-2">
        {others.map((p) => {
          const cfg = match.config.players[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 text-left transition hover:bg-white/12"
            >
              <Avatar difficulty={cfg.difficulty} seat={p} />
              <span className="flex-1 font-semibold">{cfg.name}</span>
              <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">{match.round.hands[p].length} cards</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function ChallengeDialog({
  open,
  match,
  offender,
  prevColor,
  onChallenge,
  onAccept,
}: {
  open: boolean;
  match: MatchState;
  offender: PlayerIndex;
  prevColor: Color;
  onChallenge: () => void;
  onAccept: () => void;
}) {
  const name = nameOf(match, offender);
  const chosen = match.round.activeColor;
  return (
    <Modal open={open} dismissable={false} title="Challenge the +4?" labelledBy="challenge-title">
      <p className="text-[15px] leading-relaxed text-white/85">
        <strong>{name}</strong> played a Wild Draw Four{chosen ? ` and picked ${COLOR_LABEL[chosen]}` : ""}. A Wild Draw Four is only
        allowed when the player holds <em>no</em> card of the color in play, which was{" "}
        <span className="font-semibold" style={{ color: CARD_HEX[prevColor] }}>
          {COLOR_LABEL[prevColor]}
        </span>
        .
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="rounded-xl bg-emerald-500/15 p-3">
          <strong className="text-emerald-300">Bluff caught:</strong> if {name} had a {COLOR_LABEL[prevColor]} card, they draw 4 and you
          play normally.
        </li>
        <li className="rounded-xl bg-rose-500/15 p-3">
          <strong className="text-rose-300">Wrong call:</strong> if they didn&apos;t, you draw 6 and lose your turn.
        </li>
      </ul>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" onClick={onAccept}>
          Draw 4
        </Button>
        <Button variant="danger" size="lg" onClick={onChallenge} autoFocus>
          Challenge!
        </Button>
      </div>
    </Modal>
  );
}

function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    const colors = Object.values(CARD_HEX).slice(0, 4).concat("#ffffff");
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height * 0.6,
      vx: (Math.random() - 0.5) * 2 * dpr,
      vy: (2 + Math.random() * 3) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      w: (6 + Math.random() * 6) * dpr,
      h: (8 + Math.random() * 10) * dpr,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        p.vy += 0.03 * dpr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (t - start < 4500) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50 h-dvh w-screen" aria-hidden="true" />;
}

export function RoundResultDialog({
  open,
  match,
  onNext,
  onPlayAgain,
  onMenu,
  colorblind,
}: {
  open: boolean;
  match: MatchState;
  onNext: () => void;
  onPlayAgain: () => void;
  onMenu: () => void;
  colorblind: boolean;
}) {
  const phase = match.round.phase;
  if (phase.type !== "roundOver") return null;
  const { winner, points, reason, hands, handPoints } = phase.result;
  const humanWon = winner === HUMAN;
  const target = match.config.targetScore;
  const matchOver = match.over;
  const champion = match.winner;
  let title: string;
  if (matchOver && target > 0) title = champion === HUMAN ? "You win the match!" : champion === null ? "It's a draw" : `${nameOf(match, champion)} wins the match`;
  else if (winner === null) title = "Stalemate: it's a tie";
  else title = humanWon ? "You won the round!" : `${nameOf(match, winner)} won the round`;

  const celebrate = (matchOver ? champion : winner) === HUMAN;
  return (
    <>
      <Modal open={open} dismissable={false} wide title={title} labelledBy="result-title" overlay={celebrate ? <Confetti /> : null}>
        <p className="-mt-2 mb-4 text-white/70">
          {winner === null
            ? "Nobody could play or draw."
            : `${humanWon ? "You" : nameOf(match, winner)} scored ${points} point${points === 1 ? "" : "s"}${reason === "stalemate" ? " by holding the fewest points" : ""}.`}
        </p>

        <div className="grid gap-2">
          {match.config.players.map((p, i) => {
            const isWinner = i === winner;
            return (
              <div key={i} className={`rounded-2xl p-3 ${isWinner ? "bg-amber-300/15 ring-1 ring-amber-300/50" : "bg-white/5"}`}>
                <div className="flex items-center gap-3">
                  <Avatar difficulty={p.difficulty} seat={i} human={p.kind === "human"} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">
                      {nameOf(match, i)} {isWinner && <span className="ml-1 text-amber-300">★</span>}
                    </div>
                    {target > 0 && (
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-[width] duration-700"
                          style={{ width: `${Math.min(100, (match.scores[i] / target) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="text-right tabular-nums">
                    {target > 0 && <div className="font-display text-xl">{match.scores[i]}</div>}
                    <div className="text-xs text-white/60">{isWinner ? `+${points}` : `${handPoints[i]} in hand`}</div>
                  </div>
                </div>
                {hands[i].length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 pl-[46px]">
                    {hands[i].map((id) => (
                      <PlayingCard key={id} cardId={id} colorblind={colorblind} className="w-[30px] sm:w-[36px]" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {target > 0 && !matchOver && <p className="mt-3 text-center text-sm text-white/60">First to {target} points wins the match.</p>}

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onMenu}>
            Main menu
          </Button>
          {matchOver ? (
            <Button variant="primary" size="lg" onClick={onPlayAgain} autoFocus>
              Play again
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={onNext} autoFocus>
              Next round
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}
