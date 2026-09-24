import { describe, expect, it } from "vitest";
import { chatterFor } from "@/lib/game/chatter";
import { describeEntry, statusFor } from "@/lib/game/format";
import { DEFAULT_SETTINGS, DEFAULT_SETUP, sanitizeSettings, sanitizeSetup } from "@/lib/game/settings";
import { EMPTY_STATS, recordEntries, sanitizeStats } from "@/lib/game/stats";
import { DEFAULT_PROFILE, sanitizeProfile } from "@/lib/ai";
import { DECK, OFFICIAL_RULES, createMatch, type Difficulty, type LogEntry, type MatchState } from "@/lib/uno";
import { scenario } from "./helpers";

function match(round = scenario({ hands: [["r1", "r2"], ["b1", "b2"]], discard: ["r9"] }), over = false): MatchState {
  const m = createMatch(
    {
      players: [
        { name: "You", kind: "human", difficulty: "grandmaster" },
        { name: "Nova", kind: "ai", difficulty: "shark" },
      ],
      rules: OFFICIAL_RULES,
      targetScore: 250,
    },
    1,
  );
  return { ...m, round, over, winner: over ? 0 : null };
}

describe("persisted settings", () => {
  it("falls back to defaults for garbage and clamps values", () => {
    expect(sanitizeSettings(null)).toBeNull();
    expect(sanitizeSettings("nope")).toBeNull();
    const s = sanitizeSettings({ volume: 7, speed: "warp", felt: "ocean", sound: "yes", colorblind: true });
    expect(s).toEqual({ ...DEFAULT_SETTINGS, volume: 1, felt: "ocean", colorblind: true });
  });

  it("keeps only valid opponents and trims names", () => {
    const s = sanitizeSetup({ playerName: "   Ada Lovelace the Great   ", opponents: ["shark", "boss", "rookie", "casual", "grandmaster"], targetScore: 42 });
    expect(s!.playerName).toBe("Ada Lovelace the");
    expect(s!.opponents).toEqual(["shark", "rookie", "casual"]);
    expect(s!.targetScore).toBe(DEFAULT_SETUP.targetScore);
    expect(sanitizeSetup({ opponents: [], playerName: "" })!.opponents).toEqual(DEFAULT_SETUP.opponents);
  });

  it("repairs stats and profiles field by field", () => {
    const stats = sanitizeStats({ roundsPlayed: 5, roundsWon: -3, streak: "x", byDifficulty: { shark: { played: 2, won: 1 } } });
    expect(stats!.roundsPlayed).toBe(5);
    expect(stats!.roundsWon).toBe(0);
    expect(stats!.byDifficulty.shark).toEqual({ played: 2, won: 1 });
    expect(stats!.byDifficulty.rookie).toEqual({ played: 0, won: 0 });
    expect(sanitizeProfile({ wd4Faced: 3.7, catches: -1 })).toEqual({ ...DEFAULT_PROFILE, wd4Faced: 3 });
  });
});

describe("stats recording", () => {
  it("counts rounds, streaks and the toughest opponent", () => {
    const won: LogEntry[] = [{ t: "uno", player: 0 }, { t: "roundOver", winner: 0, points: 42, reason: "out" }];
    let s = recordEntries(EMPTY_STATS, won, match(), 0);
    s = recordEntries(s, won, match(), 0);
    expect(s).toMatchObject({ roundsPlayed: 2, roundsWon: 2, streak: 2, bestStreak: 2, pointsScored: 84, bestRound: 42, unoCalls: 2 });
    expect(s.byDifficulty.shark).toEqual({ played: 2, won: 2 });
    s = recordEntries(s, [{ t: "roundOver", winner: 1, points: 10, reason: "out" }], match(undefined, true), 0);
    expect(s).toMatchObject({ roundsPlayed: 3, streak: 0, bestStreak: 2, matchesPlayed: 1 });
    expect(EMPTY_STATS.roundsPlayed).toBe(0);
  });

  it("tracks catches, challenges and wild draw fours", () => {
    const wd4 = DECK.find((c) => c.rank === "wild4")!.id;
    const entries: LogEntry[] = [
      { t: "caught", player: 0, target: 1 },
      { t: "caught", player: 1, target: 0 },
      { t: "challenge", player: 0, offender: 1, guilty: true, color: "red" },
      { t: "play", player: 0, cardId: wd4, color: "blue", prevColor: "red" },
    ];
    const s = recordEntries(EMPTY_STATS, entries, match(), 0);
    expect(s).toMatchObject({ catches: 1, timesCaught: 1, challengesWon: 1, wildFoursPlayed: 1 });
  });
});

describe("game text", () => {
  it("describes events from the player's point of view", () => {
    const m = match();
    expect(describeEntry({ t: "skip", player: 0 }, m)!.text).toBe("You are skipped.");
    expect(describeEntry({ t: "skip", player: 1 }, m)!.text).toBe("Nova is skipped.");
    expect(describeEntry({ t: "caught", player: 1, target: 0 }, m)).toMatchObject({ tone: "bad" });
    expect(describeEntry({ t: "challenge", player: 0, offender: 1, guilty: true, color: "red" }, m)!.text).toContain("bluff! Nova had Red");
    expect(describeEntry({ t: "endTurn", player: 1 }, m)).toBeNull();
    expect(describeEntry({ t: "reveal", to: 1, player: 0, cards: [] }, m)).toBeNull();
  });

  it("prompts the player with what they can play", () => {
    const m = match(scenario({ hands: [["b8", "r2"], ["y1"]], discard: ["g8"] }));
    expect(statusFor(m, null).text).toBe("Your turn: play Green or an 8, or a wild.");
    const theirs = match(scenario({ hands: [["b8"], ["y1"]], discard: ["g8"], current: 1 }));
    expect(statusFor(theirs, 1).text).toBe("Nova is thinking…");
    const stuck = match(scenario({ hands: [["b1"], ["y1"]], discard: ["r9"], drawPile: [] }));
    expect(statusFor(stuck, null).text).toMatch(/Pass/);
  });
});

describe("table talk", () => {
  const seats: (Difficulty | null)[] = [null, "shark", "rookie"];
  const difficultyOf = (p: number) => seats[p] ?? null;
  const rand = () => 0;

  it("lets AIs react in character, one line each", () => {
    const lines = chatterFor(
      [
        { t: "uno", player: 1 },
        { t: "caught", player: 2, target: 1 },
      ],
      difficultyOf,
      rand,
    );
    expect(lines.map((l) => l.player)).toEqual([1, 2]);
    expect(lines.every((l) => l.text.length > 0)).toBe(true);
  });

  it("never puts words in the human's mouth, and AIs congratulate a human winner", () => {
    const lines = chatterFor([{ t: "uno", player: 0 }, { t: "roundOver", winner: 0, points: 10, reason: "out" }], difficultyOf, rand);
    expect(lines).toHaveLength(1);
    expect(lines[0].player).toBe(1);
  });
});
