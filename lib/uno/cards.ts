/**
 * The standard 108-card deck. Every physical card has a stable numeric id
 * (0..107), so hands and piles are plain `number[]` and card identity survives
 * reshuffles, serialization and structured cloning without any mutation.
 */

export const COLORS = ["red", "yellow", "green", "blue"] as const;
export type Color = (typeof COLORS)[number];
export type CardColor = Color | "wild";

export const NUMBER_RANKS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export type NumberRank = (typeof NUMBER_RANKS)[number];
export type ActionRank = "skip" | "reverse" | "draw2";
export type WildRank = "wild" | "wild4";
export type Rank = NumberRank | ActionRank | WildRank;

/** All ranks in a fixed order; the index is used for compact bitmasks. */
export const RANKS: readonly Rank[] = [...NUMBER_RANKS, "skip", "reverse", "draw2", "wild", "wild4"];

export type CardId = number;

export interface Card {
  readonly id: CardId;
  readonly color: CardColor;
  readonly rank: Rank;
  /** Index into COLORS, or 4 for wild cards. */
  readonly colorIndex: number;
  /** Index into RANKS. */
  readonly rankIndex: number;
  /** Official scoring value. */
  readonly points: number;
}

export const WILD_COLOR_INDEX = 4;

function pointsFor(rank: Rank): number {
  if (rank === "wild" || rank === "wild4") return 50;
  if (rank === "skip" || rank === "reverse" || rank === "draw2") return 20;
  return Number(rank);
}

function buildDeck(): Card[] {
  const cards: Card[] = [];
  const add = (color: CardColor, rank: Rank) => {
    cards.push(
      Object.freeze({
        id: cards.length,
        color,
        rank,
        colorIndex: color === "wild" ? WILD_COLOR_INDEX : COLORS.indexOf(color),
        rankIndex: RANKS.indexOf(rank),
        points: pointsFor(rank),
      }),
    );
  };
  for (const color of COLORS) {
    add(color, "0");
    for (const rank of NUMBER_RANKS.slice(1)) {
      add(color, rank);
      add(color, rank);
    }
    for (const rank of ["skip", "reverse", "draw2"] as const) {
      add(color, rank);
      add(color, rank);
    }
  }
  for (let i = 0; i < 4; i++) add("wild", "wild");
  for (let i = 0; i < 4; i++) add("wild", "wild4");
  return cards;
}

export const DECK: readonly Card[] = Object.freeze(buildDeck());
export const DECK_SIZE = DECK.length;
export const ALL_CARD_IDS: readonly CardId[] = Object.freeze(DECK.map((c) => c.id));

export function getCard(id: CardId): Card {
  const card = DECK[id];
  if (!card) throw new Error(`Unknown card id ${id}`);
  return card;
}

/** Sum of official point values for a set of cards. */
export function handPoints(ids: readonly CardId[]): number {
  let total = 0;
  for (const id of ids) total += DECK[id].points;
  return total;
}

export const COLOR_LABEL: Record<CardColor, string> = {
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  wild: "Wild",
};

const RANK_LABEL: Record<Rank, string> = {
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  skip: "Skip",
  reverse: "Reverse",
  draw2: "Draw Two",
  wild: "Wild",
  wild4: "Wild Draw Four",
};

/** Human readable name, e.g. "Red 7", "Blue Skip", "Wild Draw Four". */
export function cardName(card: Card): string {
  if (card.color === "wild") return RANK_LABEL[card.rank];
  return `${COLOR_LABEL[card.color]} ${RANK_LABEL[card.rank]}`;
}

/** Sort key used to keep a hand tidy: by color, then by rank. */
export function compareCards(a: CardId, b: CardId): number {
  const ca = DECK[a];
  const cb = DECK[b];
  return ca.colorIndex - cb.colorIndex || ca.rankIndex - cb.rankIndex || a - b;
}
