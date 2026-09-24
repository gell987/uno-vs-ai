import {
  DECK as SHARED_DECK,
  createRng,
  nextFloat,
  nextInt,
  shuffleInPlace,
  type CardId,
  type Color,
  type Phase,
  type PlayerIndex,
  type PlayerView,
  type RngState,
  type RoundState,
  type Card,
} from "@/lib/uno";
import type { Beliefs, Segment } from "./beliefs";

// Local aliases and per-card bitmasks keep sampling fast inside search loops.
const DECK: readonly Card[] = SHARED_DECK;
const COLOR_BIT = Int32Array.from(DECK, (c) => 1 << c.colorIndex);
const RANK_BIT = Int32Array.from(DECK, (c) => 1 << c.rankIndex);
const scratch = new Int32Array(DECK.length);

export interface SampleOptions {
  /** Per player: probability of honoring inferred "doesn't hold X" constraints. */
  trust: number[];
  /** Per player: probability of honoring "probably holds this color" hints. */
  hintStrength: number[];
  /** Condition the sample on whether `player` holds a card of `color`. */
  force?: { player: PlayerIndex; color: Color; has: boolean };
}

export interface Deal {
  hands: CardId[][];
  drawPile: CardId[];
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/**
 * Samples one full assignment of hidden cards consistent with the beliefs:
 * a "determinization" of the imperfect-information game.
 */
export function sampleDeal(view: PlayerView, beliefs: Beliefs, rng: RngState, opts: SampleOptions): Deal {
  const n = view.numPlayers;
  const me = view.me;
  const pool = beliefs.unknownPool;
  const used = new Uint8Array(DECK.length);
  const hands: CardId[][] = new Array(n);
  const fixed: boolean[][] = new Array(n);
  hands[me] = [...view.hand];
  fixed[me] = hands[me].map(() => true);

  const jobs: { p: PlayerIndex; seg: Segment; honor: boolean }[] = [];
  for (let p = 0; p < n; p++) {
    if (p === me) continue;
    const model = beliefs.models[p];
    hands[p] = [...model.known];
    fixed[p] = hands[p].map(() => true);
    const honor = nextFloat(rng) < (opts.trust[p] ?? 1);
    for (const seg of model.segments) jobs.push({ p, seg, honor });
  }
  // Most constrained groups pick first so they are not starved.
  jobs.sort((a, b) => popcount(b.seg.colorMask) + popcount(b.seg.rankMask) - (popcount(a.seg.colorMask) + popcount(a.seg.rankMask)));

  // Each group draws uniformly from the cards it may hold. (Taking the first
  // allowed cards of one shared shuffled order would correlate the groups and
  // skew the colors of less constrained groups.)
  const take = (p: PlayerIndex, need: number, colorMask: number, rankMask: number): number => {
    let m = 0;
    for (let i = 0; i < pool.length; i++) {
      const id = pool[i];
      if (!used[id] && (COLOR_BIT[id] & colorMask) === 0 && (RANK_BIT[id] & rankMask) === 0) scratch[m++] = id;
    }
    let taken = 0;
    for (; taken < need && m > 0; taken++) {
      const k = nextInt(rng, m);
      const id = scratch[k];
      scratch[k] = scratch[--m];
      used[id] = 1;
      hands[p].push(id);
      fixed[p].push(false);
    }
    return taken;
  };
  for (const { p, seg, honor } of jobs) {
    const got = honor ? take(p, seg.count, seg.colorMask, seg.rankMask) : take(p, seg.count, 0, 0);
    // Contradictory beliefs: fill the rest with anything left.
    if (got < seg.count) take(p, seg.count - got, 0, 0);
  }

  const drawPile: CardId[] = [];
  for (const id of pool) if (!used[id]) drawPile.push(id);

  const ensure = (p: PlayerIndex, color: Color, has: boolean) => {
    const hand = hands[p];
    const matches = (id: CardId) => DECK[id].color === color;
    if (has) {
      if (hand.some(matches)) return;
      const src = drawPile.findIndex(matches);
      const slots = hand.flatMap((_, i) => (fixed[p][i] ? [] : [i]));
      if (src < 0 || slots.length === 0) return;
      const slot = slots[nextInt(rng, slots.length)];
      const tmp = hand[slot];
      hand[slot] = drawPile[src];
      drawPile[src] = tmp;
    } else {
      for (let i = 0; i < hand.length; i++) {
        if (fixed[p][i] || !matches(hand[i])) continue;
        const src = drawPile.findIndex((id) => !matches(id));
        if (src < 0) return;
        const tmp = hand[i];
        hand[i] = drawPile[src];
        drawPile[src] = tmp;
      }
    }
  };

  for (let p = 0; p < n; p++) {
    if (p === me) continue;
    const hint = beliefs.models[p].hintColor;
    if (hint && nextFloat(rng) < (opts.hintStrength[p] ?? 0)) ensure(p, hint, true);
  }
  if (opts.force) ensure(opts.force.player, opts.force.color, opts.force.has);

  // The draw pile order is unknown: keep it random.
  shuffleInPlace(drawPile, rng);
  return { hands, drawPile };
}

/** Builds a complete, simulatable round state from a view plus a sampled deal. */
export function determinize(view: PlayerView, deal: Deal, seed: number): RoundState {
  let phase: Phase;
  switch (view.phase.type) {
    case "drawnPlayable":
      phase = { type: "drawnPlayable", cardId: view.phase.cardId ?? deal.hands[view.current].at(-1)! };
      break;
    case "challenge": {
      const { offender, prevColor } = view.phase;
      const guilty = deal.hands[offender].some((id) => DECK[id].color === prevColor);
      phase = { type: "challenge", offender, prevColor, guilty };
      break;
    }
    default:
      phase = view.phase;
  }
  return {
    numPlayers: view.numPlayers,
    rules: view.rules,
    dealer: view.dealer,
    drawPile: deal.drawPile,
    discardPile: [...view.discardPile],
    hands: deal.hands,
    current: view.current,
    direction: view.direction,
    activeColor: view.activeColor,
    pendingDraw: view.pendingDraw,
    phase,
    unoCalled: [...view.unoCalled],
    unoVulnerable: view.unoVulnerable,
    passStreak: view.passStreak,
    seq: view.seq,
    rng: createRng(seed),
    log: null,
  };
}
