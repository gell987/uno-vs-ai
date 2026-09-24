import {
  ALL_CARD_IDS,
  DECK,
  OFFICIAL_RULES,
  createRng,
  normalizeRules,
  type CardId,
  type Color,
  type Direction,
  type Rank,
  type RoundState,
  type Rules,
} from "@/lib/uno";

const COLOR_CODES: Record<string, Color> = { r: "red", y: "yellow", g: "green", b: "blue" };
const RANK_CODES: Record<string, Rank> = { S: "skip", R: "reverse", "+2": "draw2" };

/**
 * Parses a short card code: "r7", "bS" (skip), "gR" (reverse), "y+2",
 * "W" (wild) and "W4" (wild draw four).
 */
function parseCode(code: string): { color: string; rank: Rank } {
  if (code === "W") return { color: "wild", rank: "wild" };
  if (code === "W4") return { color: "wild", rank: "wild4" };
  const color = COLOR_CODES[code[0]];
  const rest = code.slice(1);
  const rank = (RANK_CODES[rest] ?? rest) as Rank;
  if (!color) throw new Error(`Bad card code ${code}`);
  return { color, rank };
}

export class CardPicker {
  private used = new Set<CardId>();

  take(code: string): CardId {
    const { color, rank } = parseCode(code);
    const card = DECK.find((c) => c.color === color && c.rank === rank && !this.used.has(c.id));
    if (!card) throw new Error(`No unused card for ${code}`);
    this.used.add(card.id);
    return card.id;
  }

  remaining(): CardId[] {
    return ALL_CARD_IDS.filter((id) => !this.used.has(id));
  }
}

export interface ScenarioOptions {
  hands: string[][];
  /** Discard pile from bottom to top; the last entry is the top card. */
  discard: string[];
  activeColor?: Color;
  current?: number;
  direction?: Direction;
  rules?: Partial<Rules>;
  /** Draw pile from bottom to top. Defaults to every unused card. */
  drawPile?: string[];
  pendingDraw?: number;
  dealer?: number;
}

/** Builds an exact mid-round state for rule tests. */
export function scenario(opts: ScenarioOptions): RoundState {
  const picker = new CardPicker();
  const hands = opts.hands.map((h) => h.map((c) => picker.take(c)));
  const discardPile = opts.discard.map((c) => picker.take(c));
  const drawPile = opts.drawPile ? opts.drawPile.map((c) => picker.take(c)) : picker.remaining();
  const top = DECK[discardPile[discardPile.length - 1]];
  const activeColor = opts.activeColor ?? (top.color === "wild" ? "red" : (top.color as Color));
  const n = hands.length;
  return {
    numPlayers: n,
    rules: normalizeRules({ ...OFFICIAL_RULES, ...opts.rules }),
    dealer: opts.dealer ?? n - 1,
    drawPile,
    discardPile,
    hands,
    current: opts.current ?? 0,
    direction: opts.direction ?? 1,
    activeColor,
    pendingDraw: opts.pendingDraw ?? 0,
    phase: { type: "turn" },
    unoCalled: new Array<boolean>(n).fill(false),
    unoVulnerable: null,
    passStreak: 0,
    seq: 0,
    rng: createRng(1234),
    log: [],
  };
}

export function totalCards(s: RoundState): number {
  return s.drawPile.length + s.discardPile.length + s.hands.reduce((a, h) => a + h.length, 0);
}

export function allCardIds(s: RoundState): CardId[] {
  return [...s.drawPile, ...s.discardPile, ...s.hands.flat()];
}

export function idsOf(codes: string[]): CardId[] {
  const picker = new CardPicker();
  return codes.map((c) => picker.take(c));
}
