import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  PERSONAS,
  buildBeliefs,
  decide,
  guiltEstimate,
  observeEntries,
  readHand,
  sampleDeal,
  allowedIn,
  type DecisionContext,
  type OpponentProfile,
} from "@/lib/ai";
import {
  COLORS,
  DECK,
  DIFFICULTIES,
  OFFICIAL_RULES,
  applyAction,
  createRng,
  createRound,
  getPlayerView,
  isLegal,
  legalActions,
  nextFloat,
  nextInt,
  normalizeRules,
  type Difficulty,
  type LogEntry,
  type PlayerView,
  type RoundState,
} from "@/lib/uno";
import { scenario } from "./helpers";

function ctxFor(view: PlayerView, difficulty: Difficulty, seats: (Difficulty | null)[], extra: Partial<DecisionContext> = {}): DecisionContext {
  return { view, difficulty, seed: 7, human: null, profile: DEFAULT_PROFILE, seats, budgetMs: 40, ...extra };
}

/** Plays a random-ish game, calling `visit` on every state. */
function walkGame(seed: number, n: number, rules = OFFICIAL_RULES, visit: (s: RoundState) => void): RoundState {
  let s = createRound({ numPlayers: n, rules, dealer: seed % n, seed });
  const rng = createRng(seed + 1);
  for (let step = 0; step < 400 && s.phase.type !== "roundOver"; step++) {
    visit(s);
    const actions = legalActions(s);
    const plays = actions.filter((a) => a.type === "play");
    const a = plays.length && nextFloat(rng) < 0.8 ? plays[nextInt(rng, plays.length)] : actions[nextInt(rng, actions.length)];
    s = applyAction(s, a)!.state;
  }
  return s;
}

describe("beliefs", () => {
  it("never claim false knowledge and stay consistent with public counts", () => {
    for (let seed = 0; seed < 40; seed++) {
      const rules = normalizeRules({ sevenZero: seed % 2 === 0, drawUntilPlayable: seed % 3 === 0, stacking: seed % 5 === 0 });
      walkGame(seed, 2 + (seed % 3), rules, (s) => {
        for (let me = 0; me < s.numPlayers; me++) {
          const view = getPlayerView(s, me);
          const b = buildBeliefs(view);
          let hidden = 0;
          for (let p = 0; p < s.numPlayers; p++) {
            if (p === me) continue;
            const m = b.models[p];
            // Anything we "know" must really be in that hand.
            for (const id of m.known) expect(s.hands[p]).toContain(id);
            const total = m.known.length + m.segments.reduce((a, g) => a + g.count, 0);
            expect(total).toBe(s.hands[p].length);
            hidden += s.hands[p].length - m.known.length;
          }
          expect(b.unknownPool.length).toBe(hidden + s.drawPile.length);
        }
      });
    }
  });

  it("infer that a player who drew has none of the active color", () => {
    const s = scenario({
      hands: [["r1", "r2", "g3", "y4"], ["b1", "b2", "g5", "y6", "y7"]],
      discard: ["r9"],
      current: 1,
      drawPile: ["y8"],
    });
    s.log = [{ t: "deal", dealer: 0, handSize: 5, hands: [null, null] }, { t: "start", cardId: s.discardPile[0], first: 1 }];
    const after = applyAction(s, { type: "draw", player: 1 })!.state;
    const view = getPlayerView(after, 0);
    const read = readHand(ctxFor(view, "shark", ["shark", "shark"]), 1, 300);
    const red = COLORS.indexOf("red");
    expect(read.hasColor[red]).toBeLessThan(0.15);
    expect(read.hasWild).toBeLessThan(0.15);
    for (const c of [1, 2, 3]) expect(read.hasColor[c]).toBeGreaterThan(0.5);
  });

  it("track exact knowledge through a 7-swap", () => {
    const s = scenario({
      hands: [["r7", "b1", "g2"], ["y1", "y2", "y3", "y4"]],
      discard: ["r9"],
      rules: { sevenZero: true },
    });
    s.log = [{ t: "deal", dealer: 1, handSize: 3, hands: [[...s.hands[0]], null] }];
    const after = applyAction(s, { type: "play", player: 0, cardId: s.hands[0][0], target: 1 })!.state;
    const b = buildBeliefs(getPlayerView(after, 0));
    expect([...b.models[1].known].sort()).toEqual([s.hands[0][1], s.hands[0][2]].sort());
    expect(b.models[1].segments).toHaveLength(0);
  });
});

describe("sampling", () => {
  it("deals complete, duplicate-free hands that honor constraints", () => {
    const s = walkGame(3, 3, OFFICIAL_RULES, () => {});
    const live = s.phase.type === "roundOver" ? createRound({ numPlayers: 3, rules: OFFICIAL_RULES, dealer: 0, seed: 9 }) : s;
    const view = getPlayerView(live, 0);
    const beliefs = buildBeliefs(view);
    const rng = createRng(5);
    for (let k = 0; k < 200; k++) {
      const deal = sampleDeal(view, beliefs, rng, { trust: [1, 1, 1], hintStrength: [0, 0, 0] });
      expect(deal.hands.map((h) => h.length)).toEqual(view.handSizes);
      const all = [...deal.hands.flat(), ...deal.drawPile, ...view.discardPile];
      expect(all).toHaveLength(108);
      expect(new Set(all).size).toBe(108);
      expect(deal.hands[0]).toEqual(view.hand);
    }
  });

  it("keeps constrained cards out of constrained groups", () => {
    const s = scenario({ hands: [["r1"], ["b1", "b2", "g5"]], discard: ["r9"], current: 1, drawPile: ["y8"] });
    s.log = [{ t: "deal", dealer: 0, handSize: 3, hands: [null, null] }, { t: "start", cardId: s.discardPile[0], first: 1 }];
    const after = applyAction(s, { type: "draw", player: 1 })!.state;
    const view = getPlayerView(after, 0);
    const beliefs = buildBeliefs(view);
    const seg = beliefs.models[1].segments.find((g) => g.count === 3)!;
    expect(seg).toBeDefined();
    const rng = createRng(1);
    for (let k = 0; k < 100; k++) {
      const deal = sampleDeal(view, beliefs, rng, { trust: [1, 1], hintStrength: [0, 0] });
      const reds = deal.hands[1].filter((id) => DECK[id].color === "red" || DECK[id].color === "wild").length;
      expect(reds).toBe(0);
      expect(deal.hands[1].filter((id) => allowedIn(seg, id)).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("decisions", () => {
  it("every difficulty only ever returns legal moves", () => {
    const rng = createRng(77);
    for (let seed = 0; seed < 24; seed++) {
      const rules = normalizeRules({ sevenZero: seed % 2 === 1, stacking: seed % 4 === 0, drawUntilPlayable: seed % 3 === 0 });
      const n = 2 + (seed % 3);
      walkGame(seed, n, rules, (s) => {
        if (nextFloat(rng) > 0.25) return;
        const difficulty = DIFFICULTIES[nextInt(rng, DIFFICULTIES.length)];
        const view = getPlayerView(s, s.current);
        const seats = Array.from({ length: n }, () => difficulty);
        const d = decide({ ...ctxFor(view, difficulty, seats), budgetMs: 5 });
        expect(isLegal(s, d.action), `${difficulty}: ${JSON.stringify(d.action)}`).toBe(true);
      });
    }
  });

  it("take the win when it is available", () => {
    for (const difficulty of ["casual", "shark", "grandmaster"] as const) {
      const s = scenario({ hands: [["r5"], ["b1", "b2", "b3"]], discard: ["r9"] });
      const d = decide(ctxFor(getPlayerView(s, 0), difficulty, [difficulty, difficulty]));
      expect(d.action).toMatchObject({ type: "play", cardId: s.hands[0][0] });
    }
  });

  it("save the wild as the last card", () => {
    for (const difficulty of ["shark", "grandmaster"] as const) {
      const s = scenario({ hands: [["W", "r5"], ["b1", "b2", "b3", "g4", "g5"]], discard: ["r9"] });
      const d = decide({ ...ctxFor(getPlayerView(s, 0), difficulty, [difficulty, difficulty]), budgetMs: 150 });
      expect(d.action).toMatchObject({ type: "play", cardId: s.hands[0][1], uno: true });
    }
  });

  it("the Shark aims its wild at the color a dangerous opponent lacks", () => {
    // The opponent drew on blue and then on green, and is down to 2 cards.
    const s = scenario({
      hands: [["W", "r8", "r9", "b1", "b2"], ["y1", "y2"]],
      discard: ["b6", "g6"],
      activeColor: "green",
    });
    const [b6, g6] = s.discardPile;
    const log: LogEntry[] = [
      { t: "deal", dealer: 0, handSize: 2, hands: [null, null] },
      { t: "start", cardId: b6, first: 1 },
      { t: "draw", player: 1, count: 1, reason: "turn" },
      { t: "endTurn", player: 1 },
      { t: "play", player: 0, cardId: g6, color: "green", prevColor: "blue" },
      { t: "draw", player: 1, count: 1, reason: "turn" },
      { t: "endTurn", player: 1 },
    ];
    s.log = log;
    const view = getPlayerView(s, 0);
    const d = decide(ctxFor(view, "shark", ["shark", "shark"]));
    expect(d.action).toMatchObject({ type: "play", cardId: s.hands[0][0], color: "blue" });
  });

  it("challenge a Wild Draw Four when the bluff is certain, accept when it is unlikely", () => {
    // Player 1's hand was revealed to us earlier and still contains red cards.
    const guilty = scenario({ hands: [["b1", "b2"], ["r3", "r4", "y1"]], discard: ["r9", "W4"], activeColor: "green" });
    guilty.phase = { type: "challenge", offender: 1, prevColor: "red", guilty: true };
    guilty.log = [{ t: "reveal", to: 0, player: 1, cards: [...guilty.hands[1]] }];
    for (const difficulty of ["shark", "grandmaster"] as const) {
      const d = decide(ctxFor(getPlayerView(guilty, 0), difficulty, [difficulty, difficulty]));
      expect(d.action.type).toBe("challenge");
    }

    // Player 1 just drew on red and now holds a single card: almost surely innocent.
    const innocent = scenario({ hands: [["b1", "b2"], ["y1"]], discard: ["r9", "W4"], activeColor: "green" });
    innocent.phase = { type: "challenge", offender: 1, prevColor: "red", guilty: false };
    innocent.log = [
      { t: "deal", dealer: 0, handSize: 1, hands: [null, null] },
      { t: "start", cardId: innocent.discardPile[0], first: 1 },
      { t: "draw", player: 1, count: 1, reason: "turn" },
      { t: "endTurn", player: 1 },
    ];
    for (const difficulty of ["shark", "grandmaster"] as const) {
      const d = decide(ctxFor(getPlayerView(innocent, 0), difficulty, [difficulty, difficulty]));
      expect(d.action.type).toBe("accept");
    }
  });

  it("the Grandmaster reports its analysis", () => {
    const s = createRound({ numPlayers: 2, rules: OFFICIAL_RULES, dealer: 1, seed: 21 });
    const d = decide(ctxFor(getPlayerView(s, s.current), "grandmaster", ["grandmaster", "grandmaster"]));
    if (legalActions(s).length > 1) {
      expect(d.analysis?.kind).toBe("search");
      expect(d.analysis!.iterations).toBeGreaterThan(0);
      expect(d.analysis!.winProbability).toBeGreaterThanOrEqual(0);
      expect(d.analysis!.winProbability).toBeLessThanOrEqual(1);
    }
  });

  it("Rookies forget UNO sometimes, Grandmasters never", () => {
    const s = scenario({ hands: [["r5", "r6"], ["b1", "b2", "b3"]], discard: ["r9"] });
    let forgot = 0;
    for (let seed = 0; seed < 200; seed++) {
      const d = decide({ ...ctxFor(getPlayerView(s, 0), "rookie", ["rookie", "rookie"]), seed });
      if (d.action.type === "play" && !d.action.uno) forgot++;
      const g = decide({ ...ctxFor(getPlayerView(s, 0), "grandmaster", ["grandmaster", "grandmaster"]), seed, budgetMs: 2 });
      expect(g.action).toMatchObject({ uno: true });
    }
    expect(forgot / 200).toBeGreaterThan(PERSONAS.rookie.unoForget / 2);
    expect(forgot / 200).toBeLessThan(PERSONAS.rookie.unoForget * 2);
  });
});

describe("learning profile", () => {
  it("learns challenge habits, bluffs and UNO slips from public events", () => {
    const s = scenario({ hands: [["r1", "r2"], ["b1", "b2", "b3"]], discard: ["r9"] });
    const played = applyAction(s, { type: "play", player: 0, cardId: s.hands[0][0] })!;
    let p: OpponentProfile = observeEntries(DEFAULT_PROFILE, played.entries, played.state, 0);
    expect(p.unoChances).toBe(1);
    expect(p.unoMisses).toBe(1);

    p = observeEntries(p, [{ t: "challenge", player: 1, offender: 0, guilty: true, color: "red" }], played.state, 0);
    expect(p.challengedByAi).toBe(1);
    expect(p.caughtBluffing).toBe(1);
    expect(DEFAULT_PROFILE.challengedByAi).toBe(0);
  });

  it("shifts guilt estimates toward the observed bluffing record", () => {
    const honest = { ...DEFAULT_PROFILE, challengedByAi: 12, caughtBluffing: 0 };
    const bluffer = { ...DEFAULT_PROFILE, challengedByAi: 12, caughtBluffing: 11 };
    expect(guiltEstimate(0.5, DEFAULT_PROFILE)).toBeCloseTo(0.5, 5);
    expect(guiltEstimate(0.5, honest)).toBeLessThan(0.3);
    expect(guiltEstimate(0.5, bluffer)).toBeGreaterThan(0.7);
  });
});

describe("strength", () => {
  function play(seats: Difficulty[], seed: number): number | null {
    let s = createRound({ numPlayers: 2, rules: OFFICIAL_RULES, dealer: seed % 2, seed });
    let k = 0;
    while (s.phase.type !== "roundOver") {
      const d = decide({ ...ctxFor(getPlayerView(s, s.current), seats[s.current], seats), seed: seed * 1000 + k++ });
      s = applyAction(s, d.action)!.state;
    }
    return s.phase.result.winner;
  }

  it("the Shark clearly beats the Rookie on identical deals", () => {
    let wins = 0;
    const rounds = 150;
    for (let r = 0; r < rounds; r++) {
      if (play(["shark", "rookie"], r) === 0) wins++;
      if (play(["rookie", "shark"], r) === 1) wins++;
    }
    expect(wins / (2 * rounds)).toBeGreaterThan(0.6);
  });
});
