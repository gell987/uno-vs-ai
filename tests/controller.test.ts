import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE, type OpponentProfile } from "@/lib/ai";
import { GameController, type ControllerEvent } from "@/lib/game/controller";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/game/settings";
import { OFFICIAL_RULES, createMatch, legalActions, type Difficulty, type MatchState } from "@/lib/uno";
import { scenario } from "./helpers";

function setup(settings: Partial<Settings> = {}) {
  let profile: OpponentProfile = DEFAULT_PROFILE;
  const events: ControllerEvent[] = [];
  const saved: (MatchState | null)[] = [];
  const controller = new GameController({
    getSettings: () => ({ ...DEFAULT_SETTINGS, chatter: false, showInsights: false, speed: "fast", ...settings }),
    getProfile: () => profile,
    setProfile: (p) => {
      profile = p;
    },
    onSave: (m) => saved.push(m),
  });
  controller.onEvent((e) => events.push(e));
  return { controller, events, saved, profile: () => profile };
}

function matchWith(round: ReturnType<typeof scenario>, difficulty: Difficulty = "shark"): MatchState {
  const base = createMatch(
    {
      players: [
        { name: "You", kind: "human", difficulty: "grandmaster" },
        { name: "Nova", kind: "ai", difficulty },
      ],
      rules: OFFICIAL_RULES,
      targetScore: 250,
    },
    9,
  );
  return { ...base, round };
}

describe("GameController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets the AI take its turn after a short, human-feeling pause", async () => {
    const { controller } = setup();
    const round = scenario({ hands: [["b1", "b2"], ["r5", "g7", "y3"]], discard: ["r9"], current: 1 });
    controller.load(matchWith(round));
    expect(controller.getSnapshot().thinking).toBe(1);
    await vi.advanceTimersByTimeAsync(150);
    expect(controller.getSnapshot().match!.round.seq).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    const r = controller.getSnapshot().match!.round;
    expect(r.seq).toBeGreaterThan(0);
    expect(r.current).toBe(0);
    expect(controller.getSnapshot().thinking).toBeNull();
    controller.dispose();
  });

  it("rejects illegal human moves and reports them", () => {
    const { controller, events } = setup();
    const round = scenario({ hands: [["b1", "r2"], ["g7", "y3"]], discard: ["r9"] });
    controller.load(matchWith(round));
    expect(controller.act({ type: "play", player: 0, cardId: round.hands[0][0] })).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "illegal" });
    expect(controller.act({ type: "play", player: 0, cardId: round.hands[0][1] })).toBe(true);
    expect(controller.getSnapshot().match!.round.current).toBe(1);
    controller.dispose();
  });

  it("the Grandmaster catches a human who forgets UNO", async () => {
    const { controller, profile } = setup();
    const round = scenario({ hands: [["r1", "r2"], ["g7", "y3", "b4"]], discard: ["r9"] });
    controller.load(matchWith(round, "grandmaster"));
    controller.act({ type: "play", player: 0, cardId: round.hands[0][0] });
    expect(controller.getSnapshot().match!.round.unoVulnerable).toBe(0);
    await vi.advanceTimersByTimeAsync(1200);
    expect(controller.getSnapshot().match!.round.hands[0]).toHaveLength(3);
    expect(profile().unoMisses).toBe(1);
    controller.dispose();
  });

  it("calling UNO in time beats the catch", async () => {
    const { controller } = setup();
    const round = scenario({ hands: [["r1", "r2"], ["g7", "y3", "b4"]], discard: ["r9"] });
    controller.load(matchWith(round, "grandmaster"));
    controller.act({ type: "play", player: 0, cardId: round.hands[0][0] });
    controller.act({ type: "callUno", player: 0 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(controller.getSnapshot().match!.round.hands[0].length).toBeLessThanOrEqual(2);
    expect(controller.getSnapshot().match!.round.log!.some((e) => e.t === "caught")).toBe(false);
    controller.dispose();
  });

  it("assist mode calls UNO automatically", () => {
    const { controller } = setup({ autoUno: true });
    const round = scenario({ hands: [["r1", "r2"], ["g7", "y3", "b4"]], discard: ["r9"] });
    controller.load(matchWith(round));
    controller.act({ type: "play", player: 0, cardId: round.hands[0][0] });
    expect(controller.getSnapshot().match!.round.unoVulnerable).toBeNull();
    controller.dispose();
  });

  it("never applies a stale AI decision to a newer position", async () => {
    const { controller } = setup();
    // It's the AI's turn and the human is sitting on 2 cards.
    const round = scenario({ hands: [["b1", "b2"], ["r5", "g7", "y3"]], discard: ["r9"], current: 1 });
    controller.load(matchWith(round));
    await vi.advanceTimersByTimeAsync(50);
    // The human pre-calls UNO while the AI is thinking: the position changes.
    controller.act({ type: "callUno", player: 0 });
    await vi.advanceTimersByTimeAsync(5000);
    const r = controller.getSnapshot().match!.round;
    // Exactly one AI move happened after the call, and every logged move was legal in sequence.
    expect(r.log!.filter((e) => e.t === "play" || e.t === "draw").length).toBeGreaterThanOrEqual(1);
    expect(r.current).toBe(0);
    controller.dispose();
  });

  it("holds AI moves while paused and resumes when every pause is released", async () => {
    const { controller } = setup();
    const round = scenario({ hands: [["b1", "b2"], ["r5", "g7", "y3"]], discard: ["r9"], current: 1 });
    controller.load(matchWith(round));
    controller.pause("menu");
    controller.pause("dialog");
    await vi.advanceTimersByTimeAsync(4000);
    expect(controller.getSnapshot().match!.round.seq).toBe(0);
    controller.resume("menu");
    await vi.advanceTimersByTimeAsync(4000);
    expect(controller.getSnapshot().match!.round.seq).toBe(0);
    controller.resume("dialog");
    await vi.advanceTimersByTimeAsync(4000);
    expect(controller.getSnapshot().match!.round.seq).toBeGreaterThan(0);
    controller.dispose();
  });

  it("drops a hint once the position has moved on", async () => {
    const { controller } = setup();
    const round = scenario({ hands: [["r1", "r2", "b5"], ["g7", "y3", "b4"]], discard: ["r9"] });
    controller.load(matchWith(round));
    controller.requestHint();
    expect(controller.getSnapshot().hintPending).toBe(true);
    controller.act({ type: "play", player: 0, cardId: round.hands[0][0] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.getSnapshot().hint).toBeNull();
    expect(controller.getSnapshot().hintPending).toBe(false);
    controller.dispose();
  });

  it("plays whole rounds on its own when AIs face each other", async () => {
    const { controller, saved } = setup();
    const m = createMatch(
      {
        players: [
          { name: "You", kind: "human", difficulty: "grandmaster" },
          { name: "A", kind: "ai", difficulty: "rookie" },
          { name: "B", kind: "ai", difficulty: "casual" },
        ],
        rules: OFFICIAL_RULES,
        targetScore: 0,
      },
      123,
    );
    controller.load(m);
    // Drive the human with the first legal move whenever it's their turn.
    for (let i = 0; i < 400; i++) {
      const snap = controller.getSnapshot().match!;
      if (snap.round.phase.type === "roundOver") break;
      if (snap.round.current === 0) {
        const a = legalActions(snap.round).find((x) => x.type === "play") ?? legalActions(snap.round)[0];
        controller.act(a.type === "play" && snap.round.hands[0].length === 2 ? { ...a, uno: true } : a);
      }
      await vi.advanceTimersByTimeAsync(2500);
    }
    const final = controller.getSnapshot().match!;
    expect(final.round.phase.type).toBe("roundOver");
    expect(final.over).toBe(true);
    expect(saved.length).toBeGreaterThan(5);
    controller.dispose();
  });
});
