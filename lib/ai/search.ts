import {
  DECK,
  applyUnchecked,
  cloneRound,
  createRng,
  legalActions,
  nextFloat,
  nextU32,
  type Action,
} from "@/lib/uno";
import { buildBeliefs } from "./beliefs";
import { challengeChanceOf, estimateGuilt, sampleOptionsFor, withUnoCall } from "./heuristic";
import { PERSONAS } from "./personas";
import { rollout, type RolloutParams } from "./rollout";
import { determinize, sampleDeal } from "./sampler";
import type { CandidateEval, Decision, DecisionContext } from "./types";

export interface SearchLimits {
  budgetMs: number;
  minIterations: number;
  maxIterations: number;
}

const now = (): number => (globalThis.performance ? globalThis.performance.now() : Date.now());

/** Two plays of identical cards (e.g. either red 5) are the same move. */
function actionKey(a: Action): string {
  if (a.type !== "play") return a.type === "chooseColor" ? `color:${a.color}` : a.type;
  const c = DECK[a.cardId];
  return `play:${c.color}:${c.rank}:${a.color ?? ""}:${a.target ?? ""}`;
}

/**
 * Determinized Monte Carlo search ("perfect information Monte Carlo"):
 *
 * 1. Sample hidden hands consistent with everything this player has observed
 *    (void inference, reveals, swaps), weighted by learned habits.
 * 2. For every candidate move, play the sampled game to the end with a fast
 *    policy, using the same sample and random numbers for each candidate.
 * 3. Repeat until the time budget runs out, dropping candidates that are
 *    clearly worse, and play the move that won most often.
 */
export function searchDecide(ctx: DecisionContext, limits: SearchLimits): Decision {
  const t0 = now();
  const view = ctx.view;
  const me = view.me;
  const rng = createRng(ctx.seed);
  const persona = PERSONAS[ctx.difficulty];
  const beliefs = buildBeliefs(view);
  const sOpts = sampleOptionsFor(ctx);

  const probe = determinize(view, sampleDeal(view, beliefs, rng, sOpts), nextU32(rng));
  const seen = new Set<string>();
  const candidates: Action[] = [];
  for (const a of legalActions(probe)) {
    const key = actionKey(a);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(a);
    }
  }
  if (candidates.length === 0) throw new Error("No legal actions for AI");
  if (candidates.length === 1) return { action: withUnoCall(candidates[0], view, persona.unoForget, rng) };

  const guilt = view.phase.type === "challenge" ? estimateGuilt(ctx, beliefs, rng) : undefined;
  const params: RolloutParams = {
    challengeProb: Array.from({ length: view.numPlayers }, (_, p) => challengeChanceOf(ctx, p)),
    noise: 0.6,
    maxSteps: 500,
  };
  // Inside simulations everyone remembers to call UNO.
  const moves = candidates.map((a) => (a.type === "play" ? { ...a, uno: true } : a));

  const k = candidates.length;
  const visits = new Float64Array(k);
  const sums = new Float64Array(k);
  const sumSq = new Float64Array(k);
  let alive = Array.from({ length: k }, (_, i) => i);
  let iterations = 0;

  const mean = (i: number) => (visits[i] > 0 ? sums[i] / visits[i] : 0);
  const stdErr = (i: number) => {
    const n = visits[i];
    if (n < 2) return 1;
    const m = sums[i] / n;
    const variance = Math.max(0, sumSq[i] / n - m * m);
    return Math.sqrt(variance / n);
  };

  for (;;) {
    let force;
    if (guilt && view.phase.type === "challenge") {
      force = { player: view.phase.offender, color: view.phase.prevColor, has: nextFloat(rng) < guilt.pGuilty };
    }
    const deal = sampleDeal(view, beliefs, rng, force ? { ...sOpts, force } : sOpts);
    const det = determinize(view, deal, 0);
    const seed = nextU32(rng);
    for (const i of alive) {
      const s = cloneRound(det);
      s.rng = createRng(seed);
      applyUnchecked(s, moves[i]);
      const v = rollout(s, me, createRng(seed ^ 0x5bd1e995), params);
      visits[i]++;
      sums[i] += v;
      sumSq[i] += v * v;
    }
    iterations++;

    if (iterations % 16 === 0) {
      if (iterations >= 48 && alive.length > 1) {
        let best = alive[0];
        for (const i of alive) if (mean(i) > mean(best)) best = i;
        const seBest = stdErr(best);
        alive = alive.filter((i) => i === best || mean(i) + 3 * Math.hypot(stdErr(i), seBest) >= mean(best));
      }
      if (alive.length === 1) break;
      if (iterations >= limits.maxIterations) break;
      if (iterations >= limits.minIterations && now() - t0 >= limits.budgetMs) break;
    }
  }

  let best = alive[0];
  for (const i of alive) {
    if (mean(i) > mean(best) || (mean(i) === mean(best) && visits[i] > visits[best])) best = i;
  }
  const evals: CandidateEval[] = candidates
    .map((action, i) => ({ action, value: mean(i), visits: visits[i] }))
    .sort((a, b) => b.value - a.value || b.visits - a.visits);

  return {
    action: withUnoCall(candidates[best], view, persona.unoForget, rng),
    analysis: {
      kind: "search",
      candidates: evals,
      iterations,
      elapsedMs: Math.round(now() - t0),
      winProbability: mean(best),
      guilt,
    },
  };
}
