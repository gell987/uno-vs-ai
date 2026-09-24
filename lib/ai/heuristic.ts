import {
  COLORS,
  DECK,
  WILD_COLOR_INDEX,
  createRng,
  legalActions,
  nextFloat,
  nextU32,
  type Action,
  type CardId,
  type Color,
  type PlayAction,
  type PlayerIndex,
  type PlayerView,
  type RngState,
} from "@/lib/uno";
import { buildBeliefs, type Beliefs } from "./beliefs";
import { PERSONAS } from "./personas";
import { challengeRate, guiltEstimate, wildFollowStrength } from "./profile";
import { determinize, sampleDeal, type SampleOptions } from "./sampler";
import type { CandidateEval, Decision, DecisionContext, HandRead } from "./types";

export interface HeuristicStyle {
  /** Chance of simply playing a random playable card. */
  randomness: number;
  /** Random jitter added to every score. */
  noise: number;
  /** Reads opponents' hands from their draws and plays. */
  inference: boolean;
  /** Willing to bluff a Wild Draw Four when the odds favor it. */
  bluffs: boolean;
  /** Reluctance to spend wild cards early. */
  wildHold: number;
  /** Reluctance to spend skips, reverses and draw twos early. */
  actionHold: number;
  /** Times action cards around the threat level of the next player. */
  tactical: boolean;
  /** With inference: challenge when the estimated bluff chance exceeds this. */
  challengeThreshold: number;
  /** Without inference: challenge at this fixed rate. */
  randomChallenge: number;
  /** 0..1, how sensibly it picks colors for wilds. */
  colorSense: number;
}

export const STYLES = {
  rookie: {
    randomness: 0.55,
    noise: 2.5,
    inference: false,
    bluffs: false,
    wildHold: 0,
    actionHold: 0,
    tactical: false,
    challengeThreshold: 1,
    randomChallenge: 0.25,
    colorSense: 0.4,
  },
  casual: {
    randomness: 0.1,
    noise: 1.2,
    inference: false,
    bluffs: false,
    wildHold: 1.5,
    actionHold: 0,
    tactical: false,
    challengeThreshold: 1,
    randomChallenge: 0.2,
    colorSense: 0.9,
  },
  shark: {
    randomness: 0,
    noise: 0.05,
    inference: true,
    bluffs: true,
    wildHold: 8,
    actionHold: 1.2,
    tactical: true,
    challengeThreshold: 0.3,
    randomChallenge: 0,
    colorSense: 1,
  },
} satisfies Record<string, HeuristicStyle>;

// ---------------------------------------------------------------------------
// Shared helpers (also used by the search player and insights)
// ---------------------------------------------------------------------------

/** How confident we are in each seat's inferred constraints and color hints. */
export function sampleOptionsFor(ctx: DecisionContext): SampleOptions {
  const trust: number[] = [];
  const hintStrength: number[] = [];
  for (let p = 0; p < ctx.view.numPlayers; p++) {
    const d = ctx.seats[p];
    if (d === null || d === undefined) {
      trust.push(0.85);
      hintStrength.push(wildFollowStrength(ctx.profile));
    } else {
      trust.push(0.95);
      hintStrength.push(d === "rookie" ? 0.4 : 0.75);
    }
  }
  return { trust, hintStrength };
}

/** Chance that `p` would challenge a Wild Draw Four. */
export function challengeChanceOf(ctx: DecisionContext, p: PlayerIndex): number {
  const d = ctx.seats[p];
  if (d === null || d === undefined) return challengeRate(ctx.profile);
  return PERSONAS[d].challengeTendency;
}

export function colorCounts(hand: readonly CardId[]): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const id of hand) counts[DECK[id].colorIndex]++;
  return counts;
}

/** The color we hold most of (by count, then points), ignoring `exclude`. */
export function strongestColor(hand: readonly CardId[], exclude: CardId = -1): Color {
  const counts = [0, 0, 0, 0];
  const points = [0, 0, 0, 0];
  for (const id of hand) {
    if (id === exclude) continue;
    const c = DECK[id];
    if (c.colorIndex === WILD_COLOR_INDEX) continue;
    counts[c.colorIndex]++;
    points[c.colorIndex] += c.points;
  }
  let best = 0;
  for (let i = 1; i < 4; i++) {
    if (counts[i] > counts[best] || (counts[i] === counts[best] && points[i] > points[best])) best = i;
  }
  return COLORS[best];
}

export interface TableRead {
  /** [player][color]: probability the player holds no card of that color. */
  voidProb: number[][];
  expected: number[][];
  wildProb: number[];
  samples: number;
}

export function readTable(view: PlayerView, beliefs: Beliefs, rng: RngState, opts: SampleOptions, samples: number): TableRead {
  const n = view.numPlayers;
  const voids = Array.from({ length: n }, () => [0, 0, 0, 0]);
  const expected = Array.from({ length: n }, () => [0, 0, 0, 0]);
  const wilds = new Array(n).fill(0);
  for (let k = 0; k < samples; k++) {
    const deal = sampleDeal(view, beliefs, rng, opts);
    for (let p = 0; p < n; p++) {
      if (p === view.me) continue;
      let mask = 0;
      for (const id of deal.hands[p]) {
        const ci = DECK[id].colorIndex;
        mask |= 1 << ci;
        if (ci < 4) expected[p][ci]++;
      }
      for (let c = 0; c < 4; c++) if (!(mask & (1 << c))) voids[p][c]++;
      if (mask & (1 << WILD_COLOR_INDEX)) wilds[p]++;
    }
  }
  return {
    voidProb: voids.map((row) => row.map((v) => v / samples)),
    expected: expected.map((row) => row.map((v) => v / samples)),
    wildProb: wilds.map((v) => v / samples),
    samples,
  };
}

/** What `view.me` believes about `target`'s hand (for the insights panel). */
export function readHand(ctx: DecisionContext, target: PlayerIndex, samples = 240): HandRead {
  const rng = createRng(ctx.seed);
  const beliefs = buildBeliefs(ctx.view);
  const read = readTable(ctx.view, beliefs, rng, sampleOptionsFor(ctx), samples);
  return {
    player: target,
    hasColor: read.voidProb[target].map((v) => 1 - v),
    expectedColor: read.expected[target],
    hasWild: read.wildProb[target],
    samples,
  };
}

/** Estimated probability that a Wild Draw Four aimed at `view.me` is a bluff. */
export function estimateGuilt(ctx: DecisionContext, beliefs: Beliefs, rng: RngState): { pHasColor: number; pGuilty: number } {
  const view = ctx.view;
  if (view.phase.type !== "challenge") return { pHasColor: 0, pGuilty: 0 };
  const { offender, prevColor } = view.phase;
  const opts = sampleOptionsFor(ctx);
  const samples = 96;
  let has = 0;
  for (let k = 0; k < samples; k++) {
    const deal = sampleDeal(view, beliefs, rng, opts);
    if (deal.hands[offender].some((id) => DECK[id].color === prevColor)) has++;
  }
  const pHasColor = has / samples;
  const d = ctx.seats[offender];
  let pGuilty: number;
  if (d === null || d === undefined) {
    pGuilty = guiltEstimate(pHasColor, ctx.profile);
  } else {
    // Odds form: an AI that rarely bluffs makes "guilty" less likely than holding the color suggests.
    const beta = PERSONAS[d].bluffTendency;
    const odds = (pHasColor / Math.max(1e-6, 1 - pHasColor)) * beta;
    pGuilty = odds / (1 + odds);
  }
  return { pHasColor, pGuilty };
}

/** Adds the UNO call (or forgets it, depending on the persona). */
export function withUnoCall(action: Action, view: PlayerView, forgetChance: number, rng: RngState): Action {
  if (action.type !== "play") return action;
  if (view.hand.length !== 2) return action;
  return { ...action, uno: !(nextFloat(rng) < forgetChance) };
}

// ---------------------------------------------------------------------------
// Heuristic player
// ---------------------------------------------------------------------------

interface Evaluation {
  view: PlayerView;
  style: HeuristicStyle;
  ctx: DecisionContext;
  n: number;
  next: PlayerIndex;
  prev: PlayerIndex;
  sizes: number[];
  counts: number[];
  maxDanger: number;
  read: TableRead | null;
  holdsActiveColor: boolean;
  rng: RngState;
}

function danger(size: number): number {
  if (size <= 1) return 1;
  if (size === 2) return 0.75;
  if (size === 3) return 0.45;
  if (size === 4) return 0.25;
  return 0.1;
}

/** In a 2-player game, skips, reverses and draw twos let you play again. */
function givesExtraTurn(rank: string, n: number): boolean {
  return n === 2 && (rank === "skip" || rank === "reverse" || rank === "draw2");
}

/**
 * Can `rest` be played out entirely in this turn, starting on (colorIdx, rank)?
 * Only possible by chaining extra-turn cards in a 2-player game.
 */
function chainsOut(rest: CardId[], colorIdx: number, rank: string | null, n: number): boolean {
  if (rest.length === 0) return true;
  if (rest.length > 4) return false;
  for (let i = 0; i < rest.length; i++) {
    const c = DECK[rest[i]];
    const fits = c.colorIndex === WILD_COLOR_INDEX || c.colorIndex === colorIdx || (rank !== null && c.rank === rank);
    if (!fits) continue;
    const others = rest.filter((_, j) => j !== i);
    if (others.length === 0) return true;
    if (!givesExtraTurn(c.rank, n)) continue;
    if (chainsOut(others, c.colorIndex, c.rank, n)) return true;
  }
  return false;
}

/** Value of leaving `colorIdx` active: the next player may be unable to follow. */
function blockValue(ev: Evaluation, colorIdx: number): number {
  if (!ev.read || colorIdx < 0) return 0;
  let v = 4 * ev.read.voidProb[ev.next][colorIdx] * (0.25 + 1.6 * danger(ev.sizes[ev.next]));
  for (let q = 0; q < ev.n; q++) {
    if (q === ev.view.me || q === ev.next) continue;
    v += 1.2 * ev.read.voidProb[q][colorIdx] * danger(ev.sizes[q]);
  }
  return v;
}

function scorePlay(a: PlayAction, ev: Evaluation): number {
  const { style, view, rng } = ev;
  const c = DECK[a.cardId];
  const rest = view.hand.filter((id) => id !== a.cardId);
  const restSize = rest.length;
  if (restSize === 0) return 1000;

  const isWild = c.colorIndex === WILD_COLOR_INDEX;
  const col = isWild ? (a.color as Color) : (c.color as Color);
  const colIdx = COLORS.indexOf(col);
  const counts = ev.counts.slice();
  counts[c.colorIndex]--;
  const noise = () => (nextFloat(rng) - 0.5) * 2 * style.noise;

  // Stacking a pending penalty passes it on: almost always right.
  if (view.pendingDraw > 0) {
    return 8 + (c.rank === "draw2" ? 0.5 : 0) + counts[colIdx] * 0.3 + noise();
  }

  // Playing out the rest of the hand this very turn wins on the spot.
  if (style.tactical && givesExtraTurn(c.rank, ev.n) && chainsOut(rest, colIdx, isWild ? null : c.rank, ev.n)) return 500;

  let follow = 0;
  for (const id of rest) {
    const d = DECK[id];
    if (d.colorIndex === WILD_COLOR_INDEX) follow += 0.6;
    else if (d.colorIndex === colIdx) follow += 1;
    else if (!isWild && d.rank === c.rank) follow += 0.8;
  }

  const dNext = danger(ev.sizes[ev.next]);
  // Wilds and action cards are resources worth saving until the game gets tight.
  const urgency = Math.max(ev.maxDanger, danger(restSize) * 0.8);
  const keep = 1 - urgency;

  // Shedding a card is progress; keeping options open is the rest of the game.
  let score = 2 + 0.9 * Math.min(follow, 4) + 0.4 * counts[colIdx];
  score += c.points * 0.02 * (1 + 4 * ev.maxDanger);

  const again = givesExtraTurn(c.rank, ev.n) && follow > 0 ? 1 : 0;
  if (style.tactical) {
    switch (c.rank) {
      case "wild":
        score -= style.wildHold * keep;
        break;
      case "wild4":
        score -= style.wildHold * 1.45 * keep;
        score += 1.2 + 5 * dNext;
        break;
      case "draw2":
        score -= style.actionHold * 1.6 * keep;
        score += 0.8 + 4.5 * dNext + again;
        break;
      case "skip":
        score -= style.actionHold * keep;
        score += 0.3 + 3.5 * dNext + again;
        break;
      case "reverse":
        score -= style.actionHold * keep;
        score += ev.n === 2 ? 0.3 + 3.5 * dNext + again : 3 * (dNext - danger(ev.sizes[ev.prev]));
        break;
      default:
        break;
    }
  } else {
    if (isWild) score -= style.wildHold * keep;
    if (c.rank === "draw2" || c.rank === "wild4") score += 1;
  }

  // A wild is the perfect last card: it can always be played.
  if (restSize === 1 && counts[WILD_COLOR_INDEX] === 1) score += 4;
  else if (restSize === 2 && counts[WILD_COLOR_INDEX] >= 1) score += 1;
  // Close to going out, being able to follow up matters more than anything else.
  if (restSize <= 2) score += 1.5 * Math.min(follow, 2);

  if (isWild && style.colorSense < 1) score += (nextFloat(rng) - 0.5) * 6 * (1 - style.colorSense);

  score += blockValue(ev, colIdx);

  if (c.rank === "wild4" && view.rules.challenges && !view.rules.stacking && ev.holdsActiveColor) {
    score -= style.bluffs ? 9 * challengeChanceOf(ev.ctx, ev.next) : 100;
  }

  if (c.rank === "7" && a.target !== undefined) {
    score += 1.8 * (restSize - ev.sizes[a.target]);
    if (ev.sizes[a.target] <= 2) score += 3;
  }
  if (c.rank === "0" && view.rules.sevenZero) {
    // Hands move along: we receive the previous player's hand.
    score += 1.5 * (restSize - ev.sizes[ev.prev]);
  }

  return score + noise();
}

function scoreAction(a: Action, ev: Evaluation): number {
  const activeIdx = ev.view.activeColor ? COLORS.indexOf(ev.view.activeColor) : -1;
  switch (a.type) {
    case "play":
      return scorePlay(a, ev);
    case "draw":
      if (ev.view.pendingDraw > 0) return 0;
      // Drawing keeps the current color, which may be the one the next player lacks.
      return 0.3 + blockValue(ev, activeIdx);
    case "keep":
      return 0.3 + blockValue(ev, activeIdx);
    default:
      return 0;
  }
}

export function heuristicDecide(ctx: DecisionContext, style: HeuristicStyle): Decision {
  const start = Date.now();
  const view = ctx.view;
  const me = view.me;
  const rng = createRng(ctx.seed);
  const persona = PERSONAS[ctx.difficulty];
  const beliefs = buildBeliefs(view);
  const sOpts = sampleOptionsFor(ctx);
  const state = determinize(view, sampleDeal(view, beliefs, rng, sOpts), nextU32(rng));
  const actions = legalActions(state);
  if (actions.length === 0) throw new Error("No legal actions for AI");
  if (actions.length === 1) return { action: withUnoCall(actions[0], view, persona.unoForget, rng) };

  if (view.phase.type === "chooseStartColor") {
    const color = nextFloat(rng) < style.colorSense ? strongestColor(view.hand) : COLORS[Math.floor(nextFloat(rng) * 4)];
    return { action: { type: "chooseColor", player: me, color } };
  }

  if (view.phase.type === "challenge") {
    if (!style.inference) {
      const challenge = nextFloat(rng) < style.randomChallenge;
      return { action: { type: challenge ? "challenge" : "accept", player: me } };
    }
    const guilt = estimateGuilt(ctx, beliefs, rng);
    const challenge = guilt.pGuilty > style.challengeThreshold;
    return {
      action: { type: challenge ? "challenge" : "accept", player: me },
      analysis: { kind: "heuristic", candidates: [], iterations: 0, elapsedMs: Date.now() - start, guilt },
    };
  }

  const plays = actions.filter((a): a is PlayAction => a.type === "play");
  if (plays.length > 0 && nextFloat(rng) < style.randomness) {
    const pick = plays[Math.floor(nextFloat(rng) * plays.length)];
    return { action: withUnoCall(pick, view, persona.unoForget, rng) };
  }

  const n = view.numPlayers;
  const next = (((me + view.direction) % n) + n) % n;
  const prev = (((me - view.direction) % n) + n) % n;
  const sizes = view.handSizes;
  let maxDanger = 0;
  for (let p = 0; p < n; p++) if (p !== me) maxDanger = Math.max(maxDanger, danger(sizes[p]));
  const counts = colorCounts(view.hand);
  const activeIdx = view.activeColor ? COLORS.indexOf(view.activeColor) : -1;
  const ev: Evaluation = {
    view,
    style,
    ctx,
    n,
    next,
    prev,
    sizes,
    counts,
    maxDanger,
    read: style.inference ? readTable(view, beliefs, rng, sOpts, 48) : null,
    holdsActiveColor: activeIdx >= 0 && counts[activeIdx] > 0,
    rng,
  };

  const scored: CandidateEval[] = actions.map((action) => ({ action, value: scoreAction(action, ev), visits: 0 }));
  scored.sort((a, b) => b.value - a.value);
  return {
    action: withUnoCall(scored[0].action, view, persona.unoForget, rng),
    analysis: {
      kind: "heuristic",
      candidates: scored.slice(0, 5),
      iterations: 0,
      elapsedMs: Date.now() - start,
    },
  };
}
