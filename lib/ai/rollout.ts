import {
  DECK as SHARED_DECK,
  WILD_COLOR_INDEX,
  COLORS,
  applyUnchecked,
  canDraw,
  canStack,
  nextFloat,
  type Action,
  type Card,
  type CardId,
  type Color,
  type PlayAction,
  type PlayerIndex,
  type RngState,
  type RoundState,
} from "@/lib/uno";

// Local aliases keep the hot loop free of bundler getter calls.
const DECK: readonly Card[] = SHARED_DECK;
const WILD = WILD_COLOR_INDEX;
const apply = applyUnchecked;
const random = nextFloat;
const drawPossible = canDraw;
const stackable = canStack;
const COLOR_INDEX: Record<Color, number> = { red: 0, yellow: 1, green: 2, blue: 3 };
const scratch = new Int32Array(5);

/**
 * A deliberately cheap playout policy for Monte Carlo search. It plays like a
 * sensible casual player (follow the active color, keep wilds for later, never
 * bluff) and allocates almost nothing, so thousands of games fit in a move.
 */
export interface RolloutParams {
  /** Per player: chance of challenging a Wild Draw Four. */
  challengeProb: number[];
  /** Random jitter in card preferences, which diversifies playouts. */
  noise: number;
  /** Safety cap on playout length. */
  maxSteps: number;
}

function colorIndexOf(color: Color | null): number {
  return color === null ? -1 : COLOR_INDEX[color];
}

function strongestColorFast(hand: readonly CardId[], exclude: CardId): Color {
  scratch.fill(0);
  for (const id of hand) {
    if (id !== exclude) scratch[DECK[id].colorIndex]++;
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (scratch[i] > scratch[best]) best = i;
  return COLORS[best];
}

function makePlay(s: RoundState, p: PlayerIndex, id: CardId): PlayAction {
  const c = DECK[id];
  const a: PlayAction = { type: "play", player: p, cardId: id, uno: true };
  if (c.colorIndex === WILD) {
    a.color = strongestColorFast(s.hands[p], id);
  } else if (c.rank === "7" && s.rules.sevenZero && s.hands[p].length > 1) {
    let target = -1;
    for (let q = 0; q < s.numPlayers; q++) {
      if (q !== p && (target < 0 || s.hands[q].length < s.hands[target].length)) target = q;
    }
    a.target = target;
  }
  return a;
}

function holdsColor(hand: readonly CardId[], colorIdx: number): boolean {
  for (const id of hand) if (DECK[id].colorIndex === colorIdx) return true;
  return false;
}

export function rolloutAction(s: RoundState, rng: RngState, params: RolloutParams): Action {
  const p = s.current;
  const hand = s.hands[p];
  const phase = s.phase;
  const honestOnly = s.rules.challenges && !s.rules.stacking;

  switch (phase.type) {
    case "challenge":
      return random(rng) < params.challengeProb[p] ? { type: "challenge", player: p } : { type: "accept", player: p };
    case "chooseStartColor":
      return { type: "chooseColor", player: p, color: strongestColorFast(hand, -1) };
    case "drawnPlayable": {
      const c = DECK[phase.cardId];
      if (c.rank === "wild4" && honestOnly && holdsColor(hand, colorIndexOf(s.activeColor))) {
        return { type: "keep", player: p };
      }
      return makePlay(s, p, phase.cardId);
    }
    default:
      break;
  }

  if (s.pendingDraw > 0) {
    for (const id of hand) if (stackable(s, DECK[id])) return makePlay(s, p, id);
    return { type: "draw", player: p };
  }

  const top = DECK[s.discardPile[s.discardPile.length - 1]];
  const topWild = top.colorIndex === WILD;
  const activeIdx = colorIndexOf(s.activeColor);
  const counts = scratch;
  counts.fill(0);
  for (const id of hand) counts[DECK[id].colorIndex]++;
  const noBluff = honestOnly && activeIdx >= 0 && counts[activeIdx] > 0;
  const small = hand.length <= 2;
  const twoPlayer = s.numPlayers === 2;

  let best = -1;
  let bestScore = -Infinity;
  for (const id of hand) {
    const c = DECK[id];
    let score: number;
    if (c.colorIndex === WILD) {
      if (c.rank === "wild4" && noBluff) continue;
      score = small ? 3 : c.rank === "wild4" ? -1.8 : -1.5;
    } else if (c.colorIndex === activeIdx) {
      score = 2 + 0.25 * counts[c.colorIndex];
    } else if (!topWild && c.rankIndex === top.rankIndex) {
      score = 1 + 0.35 * counts[c.colorIndex];
    } else {
      continue;
    }
    if (c.rankIndex >= 10 && c.rankIndex <= 12) score += twoPlayer ? 1.2 : 0.8;
    score += c.points * 0.01 + random(rng) * params.noise;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  if (best >= 0) return makePlay(s, p, best);
  if (drawPossible(s)) return { type: "draw", player: p };
  return { type: "pass", player: p };
}

/** Rough win chance from hand sizes, used if a playout hits the step cap. */
function handSizeEstimate(s: RoundState, me: PlayerIndex): number {
  let total = 0;
  let mine = 0;
  for (let p = 0; p < s.numPlayers; p++) {
    const w = Math.exp(-0.6 * s.hands[p].length);
    total += w;
    if (p === me) mine = w;
  }
  return mine / total;
}

/** Plays the round out (mutating `s`) and returns `me`'s result in [0, 1]. */
export function rollout(s: RoundState, me: PlayerIndex, rng: RngState, params: RolloutParams): number {
  for (let step = 0; step < params.maxSteps; step++) {
    if (s.phase.type === "roundOver") {
      const winner = s.phase.result.winner;
      if (winner === me) return 1;
      return winner === null ? 1 / s.numPlayers : 0;
    }
    apply(s, rolloutAction(s, rng, params));
  }
  return handSizeEstimate(s, me);
}
