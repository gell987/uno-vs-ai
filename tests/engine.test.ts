import { describe, expect, it } from "vitest";
import {
  COLORS,
  DECK,
  DECK_SIZE,
  OFFICIAL_RULES,
  applyAction,
  applyMatchAction,
  createMatch,
  createRng,
  createRound,
  getPlayerView,
  isLegal,
  legalActions,
  nextFloat,
  shuffleInPlace,
  startNextRound,
  type Action,
  type RoundState,
} from "@/lib/uno";
import { allCardIds, scenario, totalCards } from "./helpers";

function mustApply(s: RoundState, a: Action): RoundState {
  const res = applyAction(s, a);
  if (!res) throw new Error(`Illegal action ${JSON.stringify(a)}`);
  return res.state;
}

function logTypes(s: RoundState): string[] {
  return (s.log ?? []).map((e) => e.t);
}

describe("deck", () => {
  it("has the official 108-card composition", () => {
    expect(DECK_SIZE).toBe(108);
    expect(new Set(DECK.map((c) => c.id)).size).toBe(108);
    for (const color of COLORS) {
      const cards = DECK.filter((c) => c.color === color);
      expect(cards).toHaveLength(25);
      expect(cards.filter((c) => c.rank === "0")).toHaveLength(1);
      for (const rank of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"]) {
        expect(cards.filter((c) => c.rank === rank)).toHaveLength(2);
      }
    }
    expect(DECK.filter((c) => c.rank === "wild")).toHaveLength(4);
    expect(DECK.filter((c) => c.rank === "wild4")).toHaveLength(4);
  });

  it("scores cards by the official values", () => {
    const pts = (rank: string) => DECK.find((c) => c.rank === rank)!.points;
    expect(pts("0")).toBe(0);
    expect(pts("9")).toBe(9);
    expect(pts("skip")).toBe(20);
    expect(pts("draw2")).toBe(20);
    expect(pts("wild")).toBe(50);
    expect(pts("wild4")).toBe(50);
  });
});

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = shuffleInPlace([...Array(20).keys()], createRng(42));
    const b = shuffleInPlace([...Array(20).keys()], createRng(42));
    const c = shuffleInPlace([...Array(20).keys()], createRng(43));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect([...a].sort((x, y) => x - y)).toEqual([...Array(20).keys()]);
  });

  it("shuffles without positional bias", () => {
    // Where does element 0 land across many shuffles of 6 items?
    const counts = new Array(6).fill(0);
    const rng = createRng(7);
    const trials = 60_000;
    for (let i = 0; i < trials; i++) counts[shuffleInPlace([0, 1, 2, 3, 4, 5], rng).indexOf(0)]++;
    for (const c of counts) expect(Math.abs(c - trials / 6)).toBeLessThan(trials * 0.01);
  });

  it("produces floats in [0, 1)", () => {
    const rng = createRng(1);
    for (let i = 0; i < 10_000; i++) {
      const x = nextFloat(rng);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

function findSeed(pred: (s: RoundState) => boolean, numPlayers = 2): RoundState {
  for (let seed = 0; seed < 20_000; seed++) {
    const s = createRound({ numPlayers, rules: OFFICIAL_RULES, dealer: numPlayers - 1, seed });
    if (pred(s)) return s;
  }
  throw new Error("no seed found");
}

const startRank = (s: RoundState) => DECK[s.discardPile[0]].rank;

describe("round setup", () => {
  it("deals hands and conserves every card", () => {
    const s = createRound({ numPlayers: 4, rules: OFFICIAL_RULES, dealer: 0, seed: 99 });
    expect(s.hands.map((h) => h.length)).toEqual([7, 7, 7, 7]);
    expect(totalCards(s)).toBe(108);
    expect(new Set(allCardIds(s)).size).toBe(108);
  });

  it("starts with the player left of the dealer on a number card", () => {
    const s = findSeed((x) => /^[0-9]$/.test(startRank(x)), 4);
    expect(s.current).toBe(0);
    expect(s.direction).toBe(1);
  });

  it("never starts with a Wild Draw Four", () => {
    for (let seed = 0; seed < 500; seed++) {
      const s = createRound({ numPlayers: 2, rules: OFFICIAL_RULES, dealer: 1, seed });
      expect(startRank(s)).not.toBe("wild4");
    }
  });

  it("lets the first player pick the color for a starting Wild", () => {
    const s = findSeed((x) => startRank(x) === "wild");
    expect(s.phase.type).toBe("chooseStartColor");
    expect(s.activeColor).toBeNull();
    expect(legalActions(s)).toHaveLength(4);
    const next = mustApply(s, { type: "chooseColor", player: s.current, color: "green" });
    expect(next.activeColor).toBe("green");
    expect(next.phase.type).toBe("turn");
    expect(next.current).toBe(s.current);
  });

  it("applies a starting Draw Two to the first player", () => {
    const s = findSeed((x) => startRank(x) === "draw2", 3);
    expect(s.hands[0]).toHaveLength(9);
    expect(s.current).toBe(1);
  });

  it("skips the first player for a starting Skip", () => {
    const s = findSeed((x) => startRank(x) === "skip", 3);
    expect(s.current).toBe(1);
    expect(s.hands[0]).toHaveLength(7);
  });

  it("lets the dealer lead in reverse for a starting Reverse", () => {
    const s = findSeed((x) => startRank(x) === "reverse", 3);
    expect(s.direction).toBe(-1);
    expect(s.current).toBe(2);
  });
});

describe("playing cards", () => {
  it("matches by color, by rank, and wilds always", () => {
    const s = scenario({ hands: [["r3", "b7", "g5", "W", "y9"], ["b1"]], discard: ["g7"] });
    const [r3, b7, g5, wild, y9] = s.hands[0];
    expect(isLegal(s, { type: "play", player: 0, cardId: b7 })).toBe(true); // rank
    expect(isLegal(s, { type: "play", player: 0, cardId: g5 })).toBe(true); // color
    expect(isLegal(s, { type: "play", player: 0, cardId: r3 })).toBe(false);
    expect(isLegal(s, { type: "play", player: 0, cardId: y9 })).toBe(false);
    expect(isLegal(s, { type: "play", player: 0, cardId: wild })).toBe(false); // needs a color
    expect(isLegal(s, { type: "play", player: 0, cardId: wild, color: "red" })).toBe(true);
    expect(isLegal(s, { type: "play", player: 1, cardId: s.hands[1][0] })).toBe(false); // not their turn
  });

  it("matches the chosen color on top of a wild, not the wild's rank", () => {
    const s = scenario({ hands: [["b2", "r2"], ["y1"]], discard: ["W"], activeColor: "blue" });
    expect(isLegal(s, { type: "play", player: 0, cardId: s.hands[0][0] })).toBe(true);
    expect(isLegal(s, { type: "play", player: 0, cardId: s.hands[0][1] })).toBe(false);
  });

  it("enumerates one action per wild color", () => {
    const s = scenario({ hands: [["W", "r1"], ["y1"]], discard: ["g7"] });
    const plays = legalActions(s).filter((a) => a.type === "play");
    expect(plays).toHaveLength(4);
    expect(legalActions(s).some((a) => a.type === "draw")).toBe(true);
  });

  it("passes the turn after a number card", () => {
    const s = scenario({ hands: [["r3", "r4"], ["b1"], ["g1"]], discard: ["r9"] });
    const next = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0] });
    expect(next.current).toBe(1);
    expect(next.activeColor).toBe("red");
    expect(next.discardPile.at(-1)).toBe(s.hands[0][0]);
  });

  it("Skip skips the next player (and replays in 2-player)", () => {
    const s3 = scenario({ hands: [["rS", "r4"], ["b1"], ["g1"]], discard: ["r9"] });
    expect(mustApply(s3, { type: "play", player: 0, cardId: s3.hands[0][0] }).current).toBe(2);
    const s2 = scenario({ hands: [["rS", "r4"], ["b1"]], discard: ["r9"] });
    expect(mustApply(s2, { type: "play", player: 0, cardId: s2.hands[0][0] }).current).toBe(0);
  });

  it("Reverse flips direction (and acts as Skip in 2-player)", () => {
    const s3 = scenario({ hands: [["rR", "r4"], ["b1"], ["g1"]], discard: ["r9"] });
    const n3 = mustApply(s3, { type: "play", player: 0, cardId: s3.hands[0][0] });
    expect(n3.direction).toBe(-1);
    expect(n3.current).toBe(2);
    const s2 = scenario({ hands: [["rR", "r4"], ["b1"]], discard: ["r9"] });
    expect(mustApply(s2, { type: "play", player: 0, cardId: s2.hands[0][0] }).current).toBe(0);
  });

  it("Draw Two makes the next player draw two and lose the turn", () => {
    const s = scenario({ hands: [["r+2", "r4"], ["b1"], ["g1"]], discard: ["r9"] });
    const next = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0] });
    expect(next.hands[1]).toHaveLength(3);
    expect(next.current).toBe(2);
    expect(totalCards(next)).toBe(108);
  });
});

describe("Wild Draw Four challenges", () => {
  const base = () =>
    scenario({ hands: [["W4", "r5", "g1"], ["b1", "b2"]], discard: ["r9"], rules: { challenges: true } });

  it("offers the victim a challenge", () => {
    const s = base();
    const next = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0], color: "blue" });
    expect(next.phase).toMatchObject({ type: "challenge", offender: 0, prevColor: "red", guilty: true });
    expect(next.current).toBe(1);
    expect(legalActions(next).map((a) => a.type).sort()).toEqual(["accept", "challenge"]);
  });

  it("accepting draws four and skips", () => {
    const s = base();
    const played = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0], color: "blue" });
    const next = mustApply(played, { type: "accept", player: 1 });
    expect(next.hands[1]).toHaveLength(6);
    expect(next.current).toBe(0);
    expect(next.activeColor).toBe("blue");
  });

  it("a successful challenge makes the bluffer draw four", () => {
    const s = base(); // player 0 holds r5 while red is active: guilty
    const played = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0], color: "blue" });
    const next = mustApply(played, { type: "challenge", player: 1 });
    expect(next.hands[0]).toHaveLength(6);
    expect(next.hands[1]).toHaveLength(2);
    expect(next.current).toBe(1);
    const reveal = next.log!.find((e) => e.t === "reveal");
    expect(reveal).toMatchObject({ to: 1, player: 0 });
  });

  it("a failed challenge costs the challenger six", () => {
    const s = scenario({ hands: [["W4", "g5"], ["b1", "b2"]], discard: ["r9"], rules: { challenges: true } });
    const played = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0], color: "blue" });
    expect(played.phase).toMatchObject({ type: "challenge", guilty: false });
    const next = mustApply(played, { type: "challenge", player: 1 });
    expect(next.hands[1]).toHaveLength(8);
    expect(next.current).toBe(0);
  });

  it("without challenges the penalty is immediate", () => {
    const s = scenario({ hands: [["W4", "r5"], ["b1"]], discard: ["r9"], rules: { challenges: false } });
    const next = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0], color: "green" });
    expect(next.hands[1]).toHaveLength(5);
    expect(next.current).toBe(0);
    expect(next.phase.type).toBe("turn");
  });
});

describe("stacking", () => {
  const rules = { stacking: true };

  it("accumulates +2s and lets the victim take the total", () => {
    const s = scenario({ hands: [["r+2", "r1"], ["b+2", "b1"], ["g1", "g2"]], discard: ["r9"], rules });
    let n = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0] });
    expect(n.pendingDraw).toBe(2);
    expect(n.current).toBe(1);
    // Normal cards are not playable under a pending penalty.
    expect(isLegal(n, { type: "play", player: 1, cardId: s.hands[1][1] })).toBe(false);
    n = mustApply(n, { type: "play", player: 1, cardId: s.hands[1][0] });
    expect(n.pendingDraw).toBe(4);
    expect(n.current).toBe(2);
    n = mustApply(n, { type: "draw", player: 2 });
    expect(n.hands[2]).toHaveLength(6);
    expect(n.pendingDraw).toBe(0);
    expect(n.current).toBe(0);
  });

  it("allows +4 on +2 but not +2 on +4", () => {
    const s = scenario({ hands: [["r+2", "r1"], ["W4", "b+2"]], discard: ["r9"], rules });
    const n = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0] });
    expect(isLegal(n, { type: "play", player: 1, cardId: s.hands[1][0], color: "green" })).toBe(true);
    const n2 = mustApply(n, { type: "play", player: 1, cardId: s.hands[1][0], color: "green" });
    expect(n2.pendingDraw).toBe(6);
    const s2 = scenario({ hands: [["W4", "r1"], ["b+2", "b1"]], discard: ["r9"], rules });
    const m = mustApply(s2, { type: "play", player: 0, cardId: s2.hands[0][0], color: "blue" });
    expect(isLegal(m, { type: "play", player: 1, cardId: s2.hands[1][0] })).toBe(false);
  });
});

describe("drawing", () => {
  it("passes the turn when the drawn card is unplayable", () => {
    const s = scenario({ hands: [["b1"], ["g1"]], discard: ["r9"], drawPile: ["y3"] });
    const n = mustApply(s, { type: "draw", player: 0 });
    expect(n.hands[0]).toHaveLength(2);
    expect(n.current).toBe(1);
    expect(logTypes(n)).toEqual(["draw", "endTurn"]);
  });

  it("offers to play a playable drawn card, and only that card", () => {
    const s = scenario({ hands: [["b1", "r2"], ["g1"]], discard: ["r9"], drawPile: ["r5"] });
    const n = mustApply(s, { type: "draw", player: 0 });
    expect(n.phase.type).toBe("drawnPlayable");
    const drawn = n.hands[0].at(-1)!;
    expect(isLegal(n, { type: "play", player: 0, cardId: s.hands[0][1] })).toBe(false);
    expect(isLegal(n, { type: "play", player: 0, cardId: drawn })).toBe(true);
    const played = mustApply(n, { type: "play", player: 0, cardId: drawn });
    expect(played.current).toBe(1);
    const kept = mustApply(n, { type: "keep", player: 0 });
    expect(kept.current).toBe(1);
    expect(kept.hands[0]).toContain(drawn);
  });

  it("draws until playable with the house rule", () => {
    const s = scenario({
      hands: [["b1"], ["g1"]],
      discard: ["r9"],
      drawPile: ["r5", "y3", "g2", "b4"], // top is b4
      rules: { drawUntilPlayable: true },
    });
    const n = mustApply(s, { type: "draw", player: 0 });
    expect(n.hands[0]).toHaveLength(5);
    expect(n.phase.type).toBe("drawnPlayable");
  });

  it("reshuffles the discard pile when the draw pile runs out", () => {
    const s = scenario({ hands: [["b1"], ["g1"]], discard: ["y1", "y2", "g3", "r9"], drawPile: [] });
    const n = mustApply(s, { type: "draw", player: 0 });
    expect(n.discardPile).toEqual([s.discardPile.at(-1)]);
    expect(n.drawPile.length + n.hands[0].length).toBe(4);
    expect(logTypes(n)[0]).toBe("reshuffle");
  });

  it("only allows passing when nothing can be played or drawn, and ends a full lap in stalemate", () => {
    const s = scenario({ hands: [["b1"], ["g1", "y5"]], discard: ["r9"], drawPile: [] });
    expect(legalActions(s)).toEqual([{ type: "pass", player: 0 }]);
    let n = mustApply(s, { type: "pass", player: 0 });
    n = mustApply(n, { type: "pass", player: 1 });
    expect(n.phase.type).toBe("roundOver");
    if (n.phase.type === "roundOver") {
      expect(n.phase.result.reason).toBe("stalemate");
      expect(n.phase.result.winner).toBe(0);
      expect(n.phase.result.points).toBe(6);
    }
  });
});

describe("UNO calls", () => {
  it("leaves a player who forgets UNO open to a catch", () => {
    const s = scenario({ hands: [["r1", "r2"], ["b1", "b2"]], discard: ["r9"] });
    const n = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0] });
    expect(n.unoVulnerable).toBe(0);
    expect(isLegal(n, { type: "catchUno", player: 1, target: 0 })).toBe(true);
    expect(isLegal(n, { type: "catchUno", player: 0, target: 0 })).toBe(false);
    const caught = mustApply(n, { type: "catchUno", player: 1, target: 0 });
    expect(caught.hands[0]).toHaveLength(3);
    expect(caught.unoVulnerable).toBeNull();
    expect(caught.current).toBe(1);
  });

  it("closes the window once the next player acts", () => {
    const s = scenario({ hands: [["r1", "r2"], ["r3", "b2", "b3"]], discard: ["r9"] });
    let n = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0] });
    n = mustApply(n, { type: "play", player: 1, cardId: s.hands[1][0] });
    expect(n.unoVulnerable).toBeNull();
    expect(isLegal(n, { type: "catchUno", player: 1, target: 0 })).toBe(false);
  });

  it("is safe when called before or while playing, or late before being caught", () => {
    const s = scenario({ hands: [["r1", "r2"], ["b1", "b2"]], discard: ["r9"] });
    const called = mustApply(s, { type: "callUno", player: 0 });
    expect(mustApply(called, { type: "play", player: 0, cardId: s.hands[0][0] }).unoVulnerable).toBeNull();
    expect(mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0], uno: true }).unoVulnerable).toBeNull();
    const forgot = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0] });
    const late = mustApply(forgot, { type: "callUno", player: 0 });
    expect(late.unoVulnerable).toBeNull();
  });

  it("rejects UNO calls with three or more cards", () => {
    const s = scenario({ hands: [["r1", "r2", "r3"], ["b1"]], discard: ["r9"] });
    expect(isLegal(s, { type: "callUno", player: 0 })).toBe(false);
  });

  it("forgets an earlier call after drawing", () => {
    const s = scenario({ hands: [["b1", "b2"], ["g1"]], discard: ["r9"], drawPile: ["y4"] });
    let n = mustApply(s, { type: "callUno", player: 0 });
    expect(n.unoCalled[0]).toBe(true);
    n = mustApply(n, { type: "draw", player: 0 });
    expect(n.unoCalled[0]).toBe(false);
  });
});

describe("7-0 house rule", () => {
  const rules = { sevenZero: true };

  it("7 swaps hands with the chosen player", () => {
    const s = scenario({ hands: [["r7", "r1", "r2"], ["b1"], ["g1", "g2", "g3", "g4"]], discard: ["r9"], rules });
    expect(isLegal(s, { type: "play", player: 0, cardId: s.hands[0][0] })).toBe(false);
    const n = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0], target: 2 });
    expect(n.hands[0]).toEqual(s.hands[2]);
    expect(n.hands[2]).toEqual([s.hands[0][1], s.hands[0][2]]);
    expect(n.current).toBe(1);
  });

  it("0 rotates every hand in the direction of play", () => {
    const s = scenario({ hands: [["r0", "r1"], ["b1"], ["g1", "g2"]], discard: ["r9"], rules });
    const n = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0] });
    expect(n.hands[1]).toEqual([s.hands[0][1]]);
    expect(n.hands[2]).toEqual(s.hands[1]);
    expect(n.hands[0]).toEqual(s.hands[2]);
  });
});

describe("round and match end", () => {
  it("scores the other hands when a player goes out", () => {
    const s = scenario({ hands: [["r1"], ["bS", "W", "g7"]], discard: ["r9"] });
    const n = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0] });
    expect(n.phase.type).toBe("roundOver");
    if (n.phase.type === "roundOver") {
      expect(n.phase.result).toMatchObject({ winner: 0, points: 77, reason: "out" });
    }
    expect(legalActions(n)).toEqual([]);
  });

  it("a closing Draw Two still makes the next player draw, and those cards score", () => {
    const s = scenario({ hands: [["r+2"], ["g7"]], discard: ["r9"], drawPile: ["b1", "b2", "b3"] });
    const n = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0] });
    expect(n.hands[1]).toHaveLength(3);
    if (n.phase.type === "roundOver") expect(n.phase.result.points).toBe(7 + 3 + 2);
  });

  it("plays a match to the target score across rounds", () => {
    const m0 = createMatch(
      {
        players: [
          { name: "A", kind: "ai", difficulty: "rookie" },
          { name: "B", kind: "ai", difficulty: "rookie" },
        ],
        rules: OFFICIAL_RULES,
        targetScore: 150,
      },
      5,
    );
    expect(m0.round.current).toBe(0);
    let m = m0;
    let guard = 0;
    while (!m.over && guard++ < 50_000) {
      if (m.round.phase.type === "roundOver") {
        const next = startNextRound(m);
        expect(next.round.dealer).toBe((m.round.dealer + 1) % 2);
        m = next;
        continue;
      }
      const actions = legalActions(m.round);
      const res = applyMatchAction(m, actions[0]);
      expect(res).not.toBeNull();
      m = res!.match;
    }
    expect(m.over).toBe(true);
    expect(Math.max(...m.scores)).toBeGreaterThanOrEqual(150);
    expect(m.winner).toBe(m.scores.indexOf(Math.max(...m.scores)));
    expect(m.history.reduce((a, r) => a + r.points, 0)).toBe(m.scores[0] + m.scores[1]);
  });
});

describe("player views", () => {
  it("hide other hands, the draw order and private events", () => {
    const s = scenario({ hands: [["W4", "r5", "g1"], ["b1", "b2"]], discard: ["r9"] });
    const played = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0], color: "blue" });
    const challenged = mustApply(played, { type: "challenge", player: 1 });
    const v0 = getPlayerView(challenged, 0);
    const v1 = getPlayerView(challenged, 1);
    expect(v1.hand).toEqual(challenged.hands[1]);
    expect(v1.handSizes).toEqual([6, 2]);
    expect(JSON.stringify(v1)).not.toContain('"drawPile"');
    // Player 1 challenged, so only player 1 saw player 0's hand.
    expect(v1.log.some((e) => e.t === "reveal")).toBe(true);
    expect(v0.log.some((e) => e.t === "reveal")).toBe(false);
    // Player 0's penalty draw is visible to player 0 only.
    const drawFor1 = v1.log.find((e) => e.t === "draw");
    const drawFor0 = v0.log.find((e) => e.t === "draw");
    expect(drawFor1 && "cards" in drawFor1 ? drawFor1.cards : undefined).toBeUndefined();
    expect(drawFor0 && drawFor0.t === "draw" ? drawFor0.cards : undefined).toHaveLength(4);
  });

  it("hide whether a Wild Draw Four was a bluff", () => {
    const s = scenario({ hands: [["W4", "r5", "g1"], ["b1", "b2"]], discard: ["r9"] });
    const played = mustApply(s, { type: "play", player: 0, cardId: s.hands[0][0], color: "blue" });
    expect(getPlayerView(played, 1).phase).toEqual({ type: "challenge", offender: 0, prevColor: "red" });
  });

  it("hide the drawn card from other players", () => {
    const s = scenario({ hands: [["b1"], ["g1"]], discard: ["r9"], drawPile: ["r5"] });
    const n = mustApply(s, { type: "draw", player: 0 });
    expect(getPlayerView(n, 1).phase).toEqual({ type: "drawnPlayable", cardId: null });
    expect(getPlayerView(n, 0).phase).toEqual({ type: "drawnPlayable", cardId: n.hands[0].at(-1) });
  });

  it("hide the initial deal of other players", () => {
    const s = createRound({ numPlayers: 3, rules: OFFICIAL_RULES, dealer: 2, seed: 3 });
    const deal = getPlayerView(s, 1).log[0];
    expect(deal.t).toBe("deal");
    if (deal.t === "deal") {
      expect(deal.hands[0]).toBeNull();
      expect(deal.hands[1]).toEqual(s.hands[1]);
      expect(deal.hands[2]).toBeNull();
    }
  });
});
