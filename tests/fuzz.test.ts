import { describe, expect, it } from "vitest";
import {
  COLORS,
  applyAction,
  createRng,
  createRound,
  getPlayerView,
  isLegal,
  legalActions,
  nextFloat,
  nextInt,
  normalizeRules,
  type Action,
  type RoundState,
} from "@/lib/uno";
import { allCardIds, totalCards } from "./helpers";

function checkInvariants(s: RoundState): void {
  expect(totalCards(s)).toBe(108);
  expect(new Set(allCardIds(s)).size).toBe(108);
  expect(s.discardPile.length).toBeGreaterThan(0);
  expect(s.current).toBeGreaterThanOrEqual(0);
  expect(s.current).toBeLessThan(s.numPlayers);
  if (s.phase.type !== "roundOver") {
    expect(legalActions(s).length).toBeGreaterThan(0);
    if (s.phase.type !== "chooseStartColor") expect(COLORS).toContain(s.activeColor);
  }
  if (s.pendingDraw > 0) expect(s.rules.stacking).toBe(true);
  if (s.unoVulnerable !== null) expect(s.hands[s.unoVulnerable]).toHaveLength(1);
}

describe("random play fuzzing", () => {
  it("keeps every invariant across 600 random rounds with random rules", () => {
    const rng = createRng(2024);
    let finished = 0;
    for (let game = 0; game < 600; game++) {
      const rules = normalizeRules({
        stacking: nextFloat(rng) < 0.5,
        challenges: nextFloat(rng) < 0.5,
        drawUntilPlayable: nextFloat(rng) < 0.5,
        sevenZero: nextFloat(rng) < 0.5,
      });
      const n = 2 + nextInt(rng, 3);
      let s = createRound({ numPlayers: n, rules, dealer: nextInt(rng, n), seed: game });
      checkInvariants(s);
      for (let step = 0; step < 1500 && s.phase.type !== "roundOver"; step++) {
        const actions: Action[] = legalActions(s);
        for (const a of actions) expect(isLegal(s, a)).toBe(true);
        // Sprinkle in out-of-turn UNO calls and catches.
        if (s.unoVulnerable !== null && nextFloat(rng) < 0.3) {
          const catcher = (s.unoVulnerable + 1) % n;
          actions.push({ type: "catchUno", player: catcher, target: s.unoVulnerable });
        }
        for (let p = 0; p < n; p++) {
          if (s.hands[p].length === 2 && !s.unoCalled[p] && nextFloat(rng) < 0.5) {
            actions.push({ type: "callUno", player: p });
          }
        }
        // Random, but like a person: usually play when possible.
        const plays = actions.filter((x) => x.type === "play");
        const a =
          plays.length > 0 && nextFloat(rng) < 0.85
            ? plays[nextInt(rng, plays.length)]
            : actions[nextInt(rng, actions.length)];
        const res = applyAction(s, a);
        expect(res, JSON.stringify(a)).not.toBeNull();
        s = res!.state;
        checkInvariants(s);
        // Views must never leak another player's hand.
        if (step % 25 === 0) {
          const me = step % n;
          const view = getPlayerView(s, me);
          for (const e of view.log) {
            if (e.t === "draw" && e.player !== me) expect(e.cards).toBeUndefined();
            if (e.t === "reveal") expect(e.to).toBe(me);
          }
        }
      }
      if (s.phase.type === "roundOver") finished++;
    }
    // Random play still finishes almost every round in reasonable time.
    expect(finished).toBeGreaterThan(580);
  });

  it("rejects malformed and out-of-turn actions", () => {
    const s = createRound({ numPlayers: 3, rules: normalizeRules({}), dealer: 2, seed: 11 });
    const other = (s.current + 1) % 3;
    const bad: Action[] = [
      { type: "draw", player: other },
      { type: "play", player: s.current, cardId: 9999 },
      { type: "play", player: s.current, cardId: s.hands[other][0] },
      { type: "keep", player: s.current },
      { type: "challenge", player: s.current },
      { type: "catchUno", player: other, target: s.current },
      { type: "draw", player: 7 },
      { type: "draw", player: -1 },
    ];
    for (const a of bad) expect(isLegal(s, a)).toBe(false);
  });
});
