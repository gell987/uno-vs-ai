import type { Difficulty } from "@/lib/uno";

export interface Persona {
  difficulty: Difficulty;
  title: string;
  tagline: string;
  description: string;
  /** Chance of forgetting to call UNO. */
  unoForget: number;
  /** If it forgot, chance it notices and calls UNO late before anyone catches it. */
  lateCall: number;
  /** Chance of catching a player who forgot UNO. */
  catchChance: number;
  /** Reaction time for catches / late calls, in ms. */
  reactionMs: [number, number];
  /** Natural pacing before acting, in ms (scaled by the speed setting). */
  thinkMs: [number, number];
  /** Rough chance it challenges a Wild Draw Four (used to model it in simulations). */
  challengeTendency: number;
  /** How often it deliberately bluffs a Wild Draw Four, relative to an honest play. */
  bluffTendency: number;
}

export const PERSONAS: Record<Difficulty, Persona> = {
  rookie: {
    difficulty: "rookie",
    title: "Rookie",
    tagline: "Just here for fun",
    description: "Plays mostly at random, often forgets to call UNO and rarely notices when you do.",
    unoForget: 0.3,
    lateCall: 0.25,
    catchChance: 0.35,
    reactionMs: [1800, 3400],
    thinkMs: [700, 1300],
    challengeTendency: 0.25,
    bluffTendency: 0.3,
  },
  casual: {
    difficulty: "casual",
    title: "Casual",
    tagline: "Knows the basics",
    description: "Sticks to its strongest color and tries to save its wilds, but plays action cards whenever it can.",
    unoForget: 0.1,
    lateCall: 0.4,
    catchChance: 0.7,
    reactionMs: [1100, 2300],
    thinkMs: [650, 1150],
    challengeTendency: 0.2,
    bluffTendency: 0.05,
  },
  shark: {
    difficulty: "shark",
    title: "Shark",
    tagline: "Counts cards",
    description:
      "Tracks every card, works out which colors you lack from your draws, targets them, and challenges or bluffs Wild Draw Fours when the odds say so.",
    unoForget: 0.03,
    lateCall: 0.6,
    catchChance: 0.95,
    reactionMs: [700, 1400],
    thinkMs: [600, 1050],
    challengeTendency: 0.35,
    bluffTendency: 0.25,
  },
  grandmaster: {
    difficulty: "grandmaster",
    title: "Grandmaster",
    tagline: "Simulates the future",
    description:
      "Everything the Shark knows, plus thousands of simulated playouts per move: it samples hands you could hold and picks the move that wins most often.",
    unoForget: 0,
    lateCall: 1,
    catchChance: 1,
    reactionMs: [450, 950],
    thinkMs: [550, 950],
    challengeTendency: 0.35,
    bluffTendency: 0.4,
  },
};

export const AI_NAMES = ["Nova", "Byte", "Echo", "Pixel", "Juno", "Atlas", "Cipher", "Orbit"] as const;
