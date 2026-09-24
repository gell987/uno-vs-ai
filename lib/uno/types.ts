import type { CardId, Color } from "./cards";
import type { RngState } from "./rng";
import type { Rules } from "./rules";

export type PlayerIndex = number;
export type Direction = 1 | -1;

export interface RoundResult {
  /** Winner of the round, or null when a stalemate ends in a tie. */
  winner: PlayerIndex | null;
  /** Points awarded to the winner. */
  points: number;
  reason: "out" | "stalemate";
  /** Every hand, revealed at the end of the round. */
  hands: CardId[][];
  handPoints: number[];
}

/**
 * The round is a small state machine. `current` is always the player who must
 * act next in the given phase.
 */
export type Phase =
  /** Play a card or draw (or, with a pending stack, stack or take the penalty). */
  | { type: "turn" }
  /** The starting card was a Wild: the first player picks the color. */
  | { type: "chooseStartColor" }
  /** The player just drew a playable card and may play it or keep it. */
  | { type: "drawnPlayable"; cardId: CardId }
  /** A Wild Draw Four was played at `current`, who may challenge it. */
  | { type: "challenge"; offender: PlayerIndex; prevColor: Color; guilty: boolean }
  | { type: "roundOver"; result: RoundResult };

export type DrawReason =
  /** A normal draw on your own turn. */
  | "turn"
  /** Taking an accumulated stack penalty. */
  | "stack"
  /** Draw Two / Wild Draw Four effect. */
  | "penalty"
  /** Caught without calling UNO. */
  | "uno"
  /** Losing a Wild Draw Four challenge (either side). */
  | "challenge"
  /** A Draw Two was the starting card. */
  | "start";

/**
 * Everything that happens is appended to the round log. The log drives the UI
 * (history, sounds, banners) and lets the AI rebuild what it knows. Entries
 * holding private information are redacted in player views (see view.ts).
 */
export type LogEntry =
  | { t: "deal"; dealer: PlayerIndex; handSize: number; hands: (CardId[] | null)[] }
  | { t: "start"; cardId: CardId; first: PlayerIndex }
  | { t: "color"; player: PlayerIndex; color: Color }
  | {
      t: "play";
      player: PlayerIndex;
      cardId: CardId;
      /** Active color after the play (the chosen color for wilds). */
      color: Color;
      /** Active color before the play. */
      prevColor: Color | null;
      target?: PlayerIndex;
      fromDraw?: boolean;
    }
  | { t: "draw"; player: PlayerIndex; count: number; reason: DrawReason; cards?: CardId[] }
  /** The turn ended after drawing without playing (unplayable or kept: indistinguishable to others). */
  | { t: "endTurn"; player: PlayerIndex }
  /** Could neither play nor draw. */
  | { t: "pass"; player: PlayerIndex }
  | { t: "skip"; player: PlayerIndex }
  | { t: "reverse"; direction: Direction }
  | { t: "challenge"; player: PlayerIndex; offender: PlayerIndex; guilty: boolean; color: Color }
  /** Private to `to`: the challenged player's hand. */
  | { t: "reveal"; to: PlayerIndex; player: PlayerIndex; cards: CardId[] }
  | { t: "uno"; player: PlayerIndex }
  | { t: "caught"; player: PlayerIndex; target: PlayerIndex }
  | { t: "swap"; player: PlayerIndex; target: PlayerIndex; hands: (CardId[] | null)[] }
  | { t: "rotate"; direction: Direction; hands: (CardId[] | null)[] }
  | { t: "reshuffle"; count: number }
  | { t: "roundOver"; winner: PlayerIndex | null; points: number; reason: "out" | "stalemate" };

export type LogType = LogEntry["t"];

export interface RoundState {
  numPlayers: number;
  rules: Rules;
  dealer: PlayerIndex;
  /** Top of the draw pile is the last element. */
  drawPile: CardId[];
  /** Top of the discard pile is the last element. */
  discardPile: CardId[];
  hands: CardId[][];
  current: PlayerIndex;
  direction: Direction;
  /** Null only while the first player picks a color for a starting Wild. */
  activeColor: Color | null;
  /** Accumulated draw penalty (stacking rule only). */
  pendingDraw: number;
  phase: Phase;
  unoCalled: boolean[];
  /** A player sitting on one card without having called UNO: catchable until the next action. */
  unoVulnerable: PlayerIndex | null;
  /** Consecutive players unable to play or draw; a full lap ends the round. */
  passStreak: number;
  /** Increments with every applied action. */
  seq: number;
  rng: RngState;
  /** Null disables logging (used by fast AI simulations). */
  log: LogEntry[] | null;
}

export type Action =
  | { type: "play"; player: PlayerIndex; cardId: CardId; color?: Color; target?: PlayerIndex; uno?: boolean }
  | { type: "draw"; player: PlayerIndex }
  | { type: "keep"; player: PlayerIndex }
  | { type: "pass"; player: PlayerIndex }
  | { type: "chooseColor"; player: PlayerIndex; color: Color }
  | { type: "challenge"; player: PlayerIndex }
  | { type: "accept"; player: PlayerIndex }
  | { type: "callUno"; player: PlayerIndex }
  | { type: "catchUno"; player: PlayerIndex; target: PlayerIndex };

export type PlayAction = Extract<Action, { type: "play" }>;

export const DIFFICULTIES = ["rookie", "casual", "shark", "grandmaster"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface PlayerConfig {
  name: string;
  kind: "human" | "ai";
  difficulty: Difficulty;
}

export interface MatchConfig {
  players: PlayerConfig[];
  rules: Rules;
  /** Points needed to win the match; 0 plays a single round. */
  targetScore: number;
}

export interface RoundSummary {
  round: number;
  winner: PlayerIndex | null;
  points: number;
  reason: "out" | "stalemate";
}

export interface MatchState {
  config: MatchConfig;
  seed: number;
  scores: number[];
  roundNumber: number;
  round: RoundState;
  history: RoundSummary[];
  /** Set once the match is over (null for a drawn single round). */
  winner: PlayerIndex | null;
  over: boolean;
}
