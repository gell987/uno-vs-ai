"use client";

import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CARD_HEX } from "@/components/cards/PlayingCard";
import { Avatar } from "@/components/ui/Avatar";
import { Button, IconButton, Modal } from "@/components/ui/primitives";
import { haptic, sound } from "@/lib/audio/sound";
import type { OpponentProfile } from "@/lib/ai";
import type { GameController } from "@/lib/game/controller";
import { HUMAN, describeAction, statusFor } from "@/lib/game/format";
import type { Settings } from "@/lib/game/settings";
import {
  COLOR_LABEL,
  DECK,
  compareCards,
  isPlayable,
  legalActions,
  type CardId,
  type Color,
  type LogEntry,
  type MatchState,
} from "@/lib/uno";
import { DirectionRing, DiscardPile, DrawPile } from "./Center";
import { ChallengeDialog, ColorPicker, RoundResultDialog, TargetPicker } from "./Dialogs";
import { Hand } from "./Hand";
import { Seat } from "./Seat";
import { SidePanel } from "./SidePanel";

interface Banner {
  id: number;
  text: string;
  color?: string;
}

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  menu: "M4 6h16M4 12h16M4 18h16",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z",
  sound: "M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14",
  mute: "M11 5 6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6",
  panel: "M4 4h16v16H4zM14 4v16",
};

/** Maps game events to sounds and big center banners. */
function feedback(entries: LogEntry[], match: MatchState, show: (text: string, color?: string) => void, settings: Settings): void {
  let delay = 0;
  const later = (fn: () => void) => {
    const d = delay;
    delay += 90;
    if (d === 0) fn();
    else setTimeout(fn, d);
  };
  for (const e of entries) {
    switch (e.t) {
      case "play": {
        const card = DECK[e.cardId];
        const color = CARD_HEX[card.color === "wild" ? e.color : card.color];
        switch (card.rank) {
          case "skip":
            later(() => sound.play("skip"));
            show("Skip!", color);
            break;
          case "reverse":
            later(() => sound.play("reverse"));
            show("Reverse!", color);
            break;
          case "draw2":
            later(() => sound.play("draw2"));
            show("+2", color);
            break;
          case "wild":
            later(() => sound.play("wild"));
            show(COLOR_LABEL[e.color], color);
            break;
          case "wild4":
            later(() => sound.play("wild4"));
            show("+4", color);
            break;
          default:
            later(() => sound.play("play"));
        }
        break;
      }
      case "draw":
        for (let i = 0; i < Math.min(e.count, 4); i++) later(() => sound.play("draw"));
        if (e.player === HUMAN && e.reason === "uno") haptic([60, 40, 60]);
        break;
      case "uno":
        later(() => sound.play("uno"));
        if (settings.voice) sound.speak("Uno!", e.player === HUMAN ? 1.1 : 0.85 + e.player * 0.08);
        show("UNO!", "#e8352e");
        if (e.player === HUMAN) haptic(30);
        break;
      case "caught":
        later(() => sound.play("caught"));
        show("Caught!", "#f59e0b");
        break;
      case "challenge": {
        later(() => sound.play("challenge"));
        const humanWins = (e.player === HUMAN && e.guilty) || (e.offender === HUMAN && !e.guilty);
        const humanLoses = (e.player === HUMAN && !e.guilty) || (e.offender === HUMAN && e.guilty);
        setTimeout(() => sound.play(humanWins ? "challengeWin" : humanLoses ? "challengeLose" : "challengeWin"), 420);
        show(e.guilty ? "Bluff!" : "No bluff!", e.guilty ? "#22c55e" : "#f43f5e");
        break;
      }
      case "swap":
        later(() => sound.play("reverse"));
        show("Swap!", "#a78bfa");
        break;
      case "rotate":
        later(() => sound.play("reverse"));
        show("Rotate!", "#a78bfa");
        break;
      case "reshuffle":
        later(() => sound.play("shuffle"));
        break;
      case "roundOver":
        setTimeout(() => {
          if (e.winner === HUMAN) sound.play(match.over ? "matchWin" : "roundWin");
          else sound.play("roundLose");
        }, 350);
        break;
      default:
        break;
    }
  }
}

export function GameScreen({
  controller,
  settings,
  profile,
  onMenu,
  onPlayAgain,
  onOpenSettings,
  onOpenRules,
  onToggleSound,
}: {
  controller: GameController;
  settings: Settings;
  profile: OpponentProfile;
  onMenu: () => void;
  onPlayAgain: () => void;
  onOpenSettings: () => void;
  onOpenRules: () => void;
  onToggleSound: () => void;
}) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const match = snap.match;
  const [pendingWild, setPendingWild] = useState<CardId | null>(null);
  const [pendingSeven, setPendingSeven] = useState<CardId | null>(null);
  const [shakeId, setShakeId] = useState<CardId | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [revealedRound, setRevealedRound] = useState<string | null>(null);
  const bannerId = useRef(0);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const showBanner = useCallback((text: string, color?: string) => {
    const id = ++bannerId.current;
    setBanner({ id, text, color });
    setTimeout(() => setBanner((b) => (b?.id === id ? null : b)), 1000);
  }, []);

  useEffect(
    () =>
      controller.onEvent((e) => {
        if (e.type === "illegal") {
          sound.play("invalid");
          if (settingsRef.current.haptics) haptic(35);
          return;
        }
        if (e.type === "roundStart") {
          sound.play("shuffle");
          return;
        }
        feedback(e.entries, e.match, showBanner, settingsRef.current);
        const r = e.match.round;
        if (r.current === HUMAN && e.actor !== HUMAN && r.phase.type !== "roundOver") {
          setTimeout(() => sound.play("yourTurn"), 380);
        }
      }),
    [controller, showBanner],
  );

  // Reveal the round result shortly after the last card lands.
  const roundOver = match?.round.phase.type === "roundOver";
  const roundKey = match ? `${match.seed}:${match.roundNumber}` : "";
  useEffect(() => {
    if (!roundOver) return;
    const t = setTimeout(() => setRevealedRound(roundKey), 1100);
    return () => clearTimeout(t);
  }, [roundOver, roundKey]);
  const resultOpen = roundOver && revealedRound === roundKey;

  useEffect(() => {
    if (!menuOpen) return;
    controller.pause("menu");
    return () => controller.resume("menu");
  }, [menuOpen, controller]);

  const round = match?.round;
  const humanTurn = !!round && round.current === HUMAN && round.phase.type !== "roundOver";
  const hand = useMemo(() => (round ? [...round.hands[HUMAN]].sort(compareCards) : []), [round]);
  const playable = useMemo(() => {
    const set = new Set<CardId>();
    if (!round || !humanTurn) return set;
    if (round.phase.type === "drawnPlayable") set.add(round.phase.cardId);
    else if (round.phase.type === "turn") for (const id of round.hands[HUMAN]) if (isPlayable(round, id)) set.add(id);
    return set;
  }, [round, humanTurn]);
  const legal = useMemo(() => (round && humanTurn ? legalActions(round) : []), [round, humanTurn]);

  const invalid = useCallback((id: CardId | null) => {
    sound.play("invalid");
    if (settingsRef.current.haptics) haptic(35);
    setShakeId(id);
    setTimeout(() => setShakeId(null), 400);
  }, []);

  const playCard = useCallback(
    (id: CardId) => {
      if (!round || !humanTurn) return;
      if (!playable.has(id)) {
        invalid(id);
        return;
      }
      const card = DECK[id];
      if (card.color === "wild") {
        setPendingWild(id);
        return;
      }
      if (round.rules.sevenZero && card.rank === "7" && round.hands[HUMAN].length > 1) {
        if (round.numPlayers === 2) controller.act({ type: "play", player: HUMAN, cardId: id, target: 1 });
        else setPendingSeven(id);
        return;
      }
      controller.act({ type: "play", player: HUMAN, cardId: id });
    },
    [round, humanTurn, playable, controller, invalid],
  );

  const drawOrPass = useCallback(() => {
    if (!humanTurn) return;
    if (legal.some((a) => a.type === "draw")) controller.act({ type: "draw", player: HUMAN });
    else if (legal.some((a) => a.type === "pass")) controller.act({ type: "pass", player: HUMAN });
    else invalid(null);
  }, [humanTurn, legal, controller, invalid]);

  const keep = useCallback(() => {
    if (legal.some((a) => a.type === "keep")) controller.act({ type: "keep", player: HUMAN });
  }, [legal, controller]);

  const callUno = useCallback(() => {
    if (!controller.act({ type: "callUno", player: HUMAN })) invalid(null);
  }, [controller, invalid]);

  const catchable = round && round.unoVulnerable !== null && round.unoVulnerable !== HUMAN ? round.unoVulnerable : null;
  const catchUno = useCallback(() => {
    if (catchable !== null) controller.act({ type: "catchUno", player: HUMAN, target: catchable });
  }, [catchable, controller]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      switch (e.key.toLowerCase()) {
        case "d":
          drawOrPass();
          break;
        case "k":
          keep();
          break;
        case "u":
          callUno();
          break;
        case "c":
          catchUno();
          break;
        case "h":
          controller.requestHint();
          break;
        case "p":
          if (round?.phase.type === "drawnPlayable" && humanTurn) playCard(round.phase.cardId);
          break;
        case "escape":
          // Without this the same key press would immediately close the menu it opens.
          e.preventDefault();
          setMenuOpen(true);
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawOrPass, keep, callUno, catchUno, controller, round, humanTurn, playCard]);

  if (!match || !round) return null;

  const status = statusFor(match, snap.thinking);
  const opponents = match.config.players.map((_, i) => i).filter((i) => i !== HUMAN);
  const handSize = round.hands[HUMAN].length;
  const unoReady = !round.unoCalled[HUMAN] && (handSize === 2 || (handSize === 1 && round.unoVulnerable === HUMAN));
  const unoUrgent = round.unoVulnerable === HUMAN;
  const saidUno = round.unoCalled[HUMAN] && handSize <= 2;
  const canDraw = legal.some((a) => a.type === "draw");
  const canPass = legal.some((a) => a.type === "pass");
  const canKeep = legal.some((a) => a.type === "keep");
  const hintAction = snap.hint && snap.hint.seq === round.seq ? snap.hint.action : null;
  const focusId =
    round.phase.type === "drawnPlayable" && humanTurn ? round.phase.cardId : hintAction?.type === "play" ? hintAction.cardId : null;
  const drawLabel = round.pendingDraw > 0 ? `Take +${round.pendingDraw}` : canPass ? "Pass" : "Draw";
  const challenge = humanTurn && round.phase.type === "challenge" ? round.phase : null;
  const compact = opponents.length > 1;
  const target = match.config.targetScore;

  const panel = (
    <SidePanel match={match} lastDecision={snap.lastDecision} handRead={snap.handRead} profile={profile} showInsights={settings.showInsights} />
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="felt relative flex h-dvh flex-col overflow-clip" data-felt={settings.felt}>
        <div className="vignette pointer-events-none absolute inset-0" aria-hidden="true" />

        {/* Top bar */}
        <header className="relative z-30 flex items-center gap-2 px-3 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] short:pt-1 sm:px-4">
          <IconButton label="Menu" onClick={() => setMenuOpen(true)}>
            <Icon d={ICONS.menu} />
          </IconButton>
          <div className="min-w-0">
            <div className="font-display text-lg leading-none sm:text-xl">
              UNO <span className="text-amber-300">vs AI</span>
            </div>
            <div className="truncate text-[11px] text-white/60 sm:text-xs">
              Round {match.roundNumber}
              {target > 0 ? ` · first to ${target}` : " · single round"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => controller.requestHint()}
                disabled={!humanTurn || snap.hintPending}
                title="Ask the Grandmaster what it would play (H)"
              >
                <Icon d={ICONS.bulb} className="h-4 w-4" />
                {snap.hintPending ? "Thinking…" : "Hint"}
              </Button>
            </div>
            <IconButton label={settings.sound ? "Mute sound" : "Unmute sound"} onClick={onToggleSound}>
              <Icon d={settings.sound ? ICONS.sound : ICONS.mute} />
            </IconButton>
            <IconButton label="AI insights and game log" onClick={() => setPanelOpen((v) => !v)} className="lg:hidden">
              <Icon d={ICONS.panel} />
            </IconButton>
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            {/* Opponents */}
            <section aria-label="Opponents" className="relative z-30 flex justify-center gap-2 px-2 pt-1 sm:gap-4 sm:pt-2">
              {opponents.map((p) => (
                <div
                  key={p}
                  className={opponents.length === 1 ? "w-[min(78%,300px)]" : opponents.length === 2 ? "w-[min(48%,260px)]" : "w-[min(32.5%,230px)]"}
                >
                  <Seat
                    match={match}
                    player={p}
                    active={round.current === p && !roundOver}
                    thinking={snap.thinking === p}
                    bubble={snap.bubbles.find((b) => b.player === p)?.text ?? null}
                    vulnerable={round.unoVulnerable === p}
                    onCatch={() => controller.act({ type: "catchUno", player: HUMAN, target: p })}
                    compact={compact}
                  />
                </div>
              ))}
            </section>

            {/* Center of the table */}
            <LayoutGroup id={`round-${match.roundNumber}`}>
              <section aria-label="Table" className="relative z-20 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 short:gap-1.5 sm:gap-5">
                <div className="relative flex items-center justify-center gap-6 px-10 py-5 short:py-2 sm:gap-10">
                  <DirectionRing direction={round.direction} />
                  <DrawPile
                    topIds={round.drawPile.slice(-3)}
                    count={round.drawPile.length}
                    canDraw={humanTurn && (canDraw || canPass) && round.phase.type === "turn"}
                    suggest={playable.size === 0 || round.pendingDraw > 0}
                    onDraw={drawOrPass}
                    label={`Draw pile, ${round.drawPile.length} cards. ${drawLabel}`}
                  />
                  <DiscardPile ids={round.discardPile} activeColor={round.activeColor} pendingDraw={round.pendingDraw} colorblind={settings.colorblind} />
                </div>
                <p
                  role="status"
                  aria-live="polite"
                  className={`glass mx-3 max-w-[92%] rounded-full px-4 py-1.5 text-center text-[13px] font-medium sm:text-sm ${
                    status.tone === "alert" ? "text-amber-200" : status.tone === "good" ? "text-emerald-200" : "text-white/85"
                  }`}
                >
                  {status.text}
                </p>
                {hintAction && (
                  <p className="-mt-1 rounded-full bg-amber-300/15 px-3 py-1 text-center text-xs text-amber-100 ring-1 ring-amber-300/40 short:hidden" data-testid="hint">
                    Grandmaster&apos;s pick: <strong>{describeAction(hintAction, match)}</strong>
                    {snap.hint?.winProbability !== undefined && <> · {Math.round(snap.hint.winProbability * 100)}% to win the round</>}
                  </p>
                )}

                <AnimatePresence>
                  {banner && (
                    <motion.div
                      key={banner.id}
                      initial={{ opacity: 0, scale: 0.4, rotate: -8 }}
                      animate={{ opacity: 1, scale: 1, rotate: -4 }}
                      exit={{ opacity: 0, scale: 1.4 }}
                      transition={{ type: "spring", stiffness: 500, damping: 26 }}
                      className="font-display text-shadow pointer-events-none absolute z-40 text-6xl text-white sm:text-8xl"
                      style={{ WebkitTextStroke: "2px rgb(0 0 0 / 0.35)", filter: `drop-shadow(0 0 22px ${banner.color ?? "#fff"})` }}
                      aria-hidden="true"
                    >
                      {banner.text}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* The human player */}
              <section aria-label="Your hand" className="relative z-10 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 pb-1 short:pb-0 sm:gap-3">
                  <div className={`flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 ${humanTurn ? "bg-amber-300/20 ring-1 ring-amber-300/60" : "bg-black/20"}`}>
                    <Avatar human seat={0} size={30} />
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-sm font-semibold">{match.config.players[HUMAN].name}</div>
                      <div className="text-[11px] text-white/60">
                        {handSize} card{handSize === 1 ? "" : "s"}
                        {target > 0 && <> · {match.scores[HUMAN]} pts</>}
                      </div>
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    onClick={callUno}
                    disabled={!unoReady}
                    aria-label="Call UNO (U)"
                    className={`font-display relative h-12 min-w-[84px] rounded-full px-4 text-xl text-white transition disabled:opacity-35 ${
                      saidUno ? "bg-emerald-600" : "bg-gradient-to-b from-[#ff5a4f] to-[#c81e1e] shadow-[0_4px_0_#7f1d1d]"
                    } ${unoReady ? "animate-pulse-ring" : ""}`}
                    animate={unoUrgent ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                    transition={unoUrgent ? { repeat: Infinity, duration: 0.6 } : undefined}
                  >
                    {saidUno ? "UNO ✓" : "UNO!"}
                  </motion.button>

                  <div className="ml-auto flex items-center gap-2">
                    {canKeep && (
                      <Button variant="secondary" onClick={keep} title="Keep the drawn card and end your turn (K)">
                        Keep
                      </Button>
                    )}
                    {round.phase.type === "drawnPlayable" && humanTurn && (
                      <Button variant="primary" onClick={() => playCard((round.phase as { cardId: CardId }).cardId)} title="Play the drawn card (P)">
                        Play it
                      </Button>
                    )}
                    {(canDraw || canPass) && round.phase.type === "turn" && (
                      <Button variant={round.pendingDraw > 0 || playable.size === 0 ? "primary" : "secondary"} onClick={drawOrPass} title="Draw a card (D)">
                        {drawLabel}
                      </Button>
                    )}
                    <div className="sm:hidden">
                      <IconButton label="Hint (H)" onClick={() => controller.requestHint()} disabled={!humanTurn || snap.hintPending} className="disabled:opacity-40">
                        <Icon d={ICONS.bulb} />
                      </IconButton>
                    </div>
                  </div>
                </div>
                <div className="mx-auto max-w-5xl px-2">
                  <Hand
                    cards={hand}
                    playable={playable}
                    active={humanTurn && (round.phase.type === "turn" || round.phase.type === "drawnPlayable")}
                    showHints={settings.hints}
                    focusId={focusId}
                    shakeId={shakeId}
                    colorblind={settings.colorblind}
                    onPlay={playCard}
                  />
                </div>
              </section>
            </LayoutGroup>
          </main>

          {/* Side panel: inline on large screens, a drawer on small ones. */}
          <aside className="glass relative z-20 m-3 ml-0 hidden w-[340px] shrink-0 flex-col rounded-3xl p-3 lg:flex">{panel}</aside>
          <AnimatePresence>
            {panelOpen && (
              <>
                <motion.div
                  key="scrim"
                  className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setPanelOpen(false)}
                />
                <motion.aside
                  key="drawer"
                  className="fixed inset-y-0 right-0 z-50 flex w-[min(360px,92vw)] flex-col bg-[#0d1813] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl lg:hidden"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", stiffness: 380, damping: 38 }}
                >
                  <div className="mb-2 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setPanelOpen(false)}>
                      Close
                    </Button>
                  </div>
                  {panel}
                </motion.aside>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Decisions */}
        <ColorPicker
          open={pendingWild !== null}
          hand={round.hands[HUMAN]}
          exclude={pendingWild}
          colorblind={settings.colorblind}
          onCancel={() => setPendingWild(null)}
          onPick={(color: Color) => {
            const id = pendingWild;
            setPendingWild(null);
            if (id !== null) controller.act({ type: "play", player: HUMAN, cardId: id, color });
          }}
        />
        <ColorPicker
          open={humanTurn && round.phase.type === "chooseStartColor"}
          hand={round.hands[HUMAN]}
          exclude={null}
          colorblind={settings.colorblind}
          title="Choose the starting color"
          onPick={(color: Color) => controller.act({ type: "chooseColor", player: HUMAN, color })}
        />
        <TargetPicker
          open={pendingSeven !== null}
          match={match}
          onCancel={() => setPendingSeven(null)}
          onPick={(p) => {
            const id = pendingSeven;
            setPendingSeven(null);
            if (id !== null) controller.act({ type: "play", player: HUMAN, cardId: id, target: p });
          }}
        />
        {challenge && (
          <ChallengeDialog
            open
            match={match}
            offender={challenge.offender}
            prevColor={challenge.prevColor}
            onChallenge={() => controller.act({ type: "challenge", player: HUMAN })}
            onAccept={() => controller.act({ type: "accept", player: HUMAN })}
          />
        )}
        <RoundResultDialog
          open={resultOpen}
          match={match}
          colorblind={settings.colorblind}
          onNext={() => controller.nextRound()}
          onPlayAgain={onPlayAgain}
          onMenu={onMenu}
        />

        <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Paused" labelledBy="menu-title">
          <div className="grid gap-2">
            <Button variant="primary" size="lg" onClick={() => setMenuOpen(false)} autoFocus>
              Resume
            </Button>
            <Button variant="secondary" onClick={() => { setMenuOpen(false); onOpenRules(); }}>
              How to play
            </Button>
            <Button variant="secondary" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>
              Settings
            </Button>
            <Button variant="secondary" onClick={() => { setMenuOpen(false); onPlayAgain(); }}>
              Restart match
            </Button>
            <Button variant="ghost" onClick={() => { setMenuOpen(false); onMenu(); }}>
              Save &amp; quit to menu
            </Button>
          </div>
          <p className="mt-4 text-center text-xs text-white/50">
            Shortcuts: D draw · K keep · P play drawn · U UNO · C catch · H hint · ←/→ browse cards · Esc menu
          </p>
        </Modal>
      </div>
    </MotionConfig>
  );
}
