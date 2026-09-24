import type { Action, Difficulty, PlayerIndex, PlayerView } from "@/lib/uno";
import type { OpponentProfile } from "./profile";

export interface DecisionContext {
  view: PlayerView;
  difficulty: Difficulty;
  seed: number;
  /** Seat of the human player, whose habits the profile describes (null in AI-only games). */
  human: PlayerIndex | null;
  profile: OpponentProfile;
  /** Difficulty per seat, null for humans. Used to model opponents in simulations. */
  seats: (Difficulty | null)[];
  /** Thinking budget for search-based players, in milliseconds. */
  budgetMs?: number;
}

export interface CandidateEval {
  action: Action;
  /** Win probability (search) or heuristic score. */
  value: number;
  visits: number;
}

export interface DecisionAnalysis {
  kind: "search" | "heuristic";
  candidates: CandidateEval[];
  iterations: number;
  elapsedMs: number;
  /** Estimated chance of winning the round after the chosen move (search only). */
  winProbability?: number;
  /** For challenge decisions: how likely the Wild Draw Four was a bluff. */
  guilt?: { pHasColor: number; pGuilty: number };
}

export interface Decision {
  action: Action;
  analysis?: DecisionAnalysis;
}

/** Estimated probabilities about one opponent's hidden hand. */
export interface HandRead {
  player: PlayerIndex;
  /** P(holds at least one card of each color): red, yellow, green, blue. */
  hasColor: number[];
  /** Expected number of cards of each color. */
  expectedColor: number[];
  /** P(holds at least one wild card). */
  hasWild: number;
  samples: number;
}
