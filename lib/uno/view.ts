import type { CardId, Color } from "./cards";
import type { Rules } from "./rules";
import type { Direction, LogEntry, PlayerIndex, RoundResult, RoundState } from "./types";

export type ViewPhase =
  | { type: "turn" }
  | { type: "chooseStartColor" }
  /** `cardId` is only visible to the player who drew it. */
  | { type: "drawnPlayable"; cardId: CardId | null }
  /** Whether the offender was bluffing is hidden until someone challenges. */
  | { type: "challenge"; offender: PlayerIndex; prevColor: Color }
  | { type: "roundOver"; result: RoundResult };

/**
 * Everything one player is allowed to know. AI opponents only ever receive a
 * view, so they cannot peek at other hands or at the draw pile order.
 */
export interface PlayerView {
  me: PlayerIndex;
  numPlayers: number;
  rules: Rules;
  dealer: PlayerIndex;
  hand: CardId[];
  handSizes: number[];
  drawPileSize: number;
  discardPile: CardId[];
  current: PlayerIndex;
  direction: Direction;
  activeColor: Color | null;
  pendingDraw: number;
  phase: ViewPhase;
  unoCalled: boolean[];
  unoVulnerable: PlayerIndex | null;
  passStreak: number;
  seq: number;
  log: LogEntry[];
}

function onlyMine(hands: (CardId[] | null)[], me: PlayerIndex): (CardId[] | null)[] {
  return hands.map((h, i) => (i === me && h ? [...h] : null));
}

/** Removes what `me` is not allowed to see from a log entry (null = hidden entirely). */
export function redactEntry(e: LogEntry, me: PlayerIndex): LogEntry | null {
  switch (e.t) {
    case "deal":
      return { ...e, hands: onlyMine(e.hands, me) };
    case "draw":
      if (e.player === me) return { ...e, cards: e.cards ? [...e.cards] : [] };
      return { t: "draw", player: e.player, count: e.count, reason: e.reason };
    case "reveal":
      return e.to === me ? { ...e, cards: [...e.cards] } : null;
    case "swap":
    case "rotate":
      return { ...e, hands: onlyMine(e.hands, me) };
    default:
      return e;
  }
}

export function getPlayerView(s: RoundState, me: PlayerIndex): PlayerView {
  let phase: ViewPhase;
  switch (s.phase.type) {
    case "drawnPlayable":
      phase = { type: "drawnPlayable", cardId: s.current === me ? s.phase.cardId : null };
      break;
    case "challenge":
      phase = { type: "challenge", offender: s.phase.offender, prevColor: s.phase.prevColor };
      break;
    default:
      phase = s.phase;
  }
  const log: LogEntry[] = [];
  for (const e of s.log ?? []) {
    const r = redactEntry(e, me);
    if (r) log.push(r);
  }
  return {
    me,
    numPlayers: s.numPlayers,
    rules: s.rules,
    dealer: s.dealer,
    hand: [...s.hands[me]],
    handSizes: s.hands.map((h) => h.length),
    drawPileSize: s.drawPile.length,
    discardPile: [...s.discardPile],
    current: s.current,
    direction: s.direction,
    activeColor: s.activeColor,
    pendingDraw: s.pendingDraw,
    phase,
    unoCalled: [...s.unoCalled],
    unoVulnerable: s.unoVulnerable,
    passStreak: s.passStreak,
    seq: s.seq,
    log,
  };
}
