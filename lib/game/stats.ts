import { DECK, DIFFICULTIES, type Difficulty, type LogEntry, type MatchState, type PlayerIndex } from "@/lib/uno";
import { isRecord, pickNum } from "./storage";

export interface WinRecord {
  played: number;
  won: number;
}

export interface Stats {
  matchesPlayed: number;
  matchesWon: number;
  roundsPlayed: number;
  roundsWon: number;
  pointsScored: number;
  bestRound: number;
  streak: number;
  bestStreak: number;
  unoCalls: number;
  timesCaught: number;
  catches: number;
  challengesWon: number;
  challengesLost: number;
  wildFoursPlayed: number;
  /** Rounds against each difficulty (the toughest opponent at the table). */
  byDifficulty: Record<Difficulty, WinRecord>;
}

export const EMPTY_STATS: Stats = {
  matchesPlayed: 0,
  matchesWon: 0,
  roundsPlayed: 0,
  roundsWon: 0,
  pointsScored: 0,
  bestRound: 0,
  streak: 0,
  bestStreak: 0,
  unoCalls: 0,
  timesCaught: 0,
  catches: 0,
  challengesWon: 0,
  challengesLost: 0,
  wildFoursPlayed: 0,
  byDifficulty: { rookie: { played: 0, won: 0 }, casual: { played: 0, won: 0 }, shark: { played: 0, won: 0 }, grandmaster: { played: 0, won: 0 } },
};

export function sanitizeStats(raw: unknown): Stats | null {
  if (!isRecord(raw)) return null;
  const out: Stats = structuredClone(EMPTY_STATS);
  for (const key of Object.keys(out) as (keyof Stats)[]) {
    if (key === "byDifficulty") continue;
    (out as unknown as Record<string, number>)[key] = Math.floor(pickNum(raw[key], 0, 0));
  }
  if (isRecord(raw.byDifficulty)) {
    for (const d of DIFFICULTIES) {
      const r = raw.byDifficulty[d];
      if (isRecord(r)) out.byDifficulty[d] = { played: Math.floor(pickNum(r.played, 0, 0)), won: Math.floor(pickNum(r.won, 0, 0)) };
    }
  }
  return out;
}

const ORDER: Record<Difficulty, number> = { rookie: 0, casual: 1, shark: 2, grandmaster: 3 };

export function toughestOpponent(match: MatchState, human: PlayerIndex): Difficulty {
  let best: Difficulty = "rookie";
  match.config.players.forEach((p, i) => {
    if (i !== human && p.kind === "ai" && ORDER[p.difficulty] > ORDER[best]) best = p.difficulty;
  });
  return best;
}

/** Folds one action's log entries (and the resulting match) into the lifetime stats. */
export function recordEntries(stats: Stats, entries: readonly LogEntry[], after: MatchState, human: PlayerIndex): Stats {
  let s = stats;
  const edit = () => {
    if (s === stats) s = structuredClone(stats);
    return s;
  };
  for (const e of entries) {
    switch (e.t) {
      case "uno":
        if (e.player === human) edit().unoCalls++;
        break;
      case "caught":
        if (e.target === human) edit().timesCaught++;
        if (e.player === human) edit().catches++;
        break;
      case "challenge":
        if (e.player === human) {
          if (e.guilty) edit().challengesWon++;
          else edit().challengesLost++;
        }
        break;
      case "play":
        if (e.player === human && DECK[e.cardId].rank === "wild4") edit().wildFoursPlayed++;
        break;
      case "roundOver": {
        const x = edit();
        x.roundsPlayed++;
        const tough = toughestOpponent(after, human);
        x.byDifficulty[tough].played++;
        if (e.winner === human) {
          x.roundsWon++;
          x.byDifficulty[tough].won++;
          x.pointsScored += e.points;
          x.bestRound = Math.max(x.bestRound, e.points);
          x.streak++;
          x.bestStreak = Math.max(x.bestStreak, x.streak);
        } else {
          x.streak = 0;
        }
        if (after.over) {
          x.matchesPlayed++;
          if (after.winner === human) x.matchesWon++;
        }
        break;
      }
      default:
        break;
    }
  }
  return s;
}
