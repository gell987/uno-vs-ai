/**
 * Rule configuration. Defaults follow the official Mattel rules; popular house
 * rules can be switched on individually.
 */
export interface Rules {
  /** House rule: +2 on +2, +4 on +2 and +4 on +4 pass an accumulated penalty along. */
  stacking: boolean;
  /**
   * Official rule: a Wild Draw Four may be challenged. If the player held a card
   * of the active color they draw 4 instead; otherwise the challenger draws 6.
   * Not available together with stacking.
   */
  challenges: boolean;
  /** House rule: keep drawing until a playable card turns up. */
  drawUntilPlayable: boolean;
  /** House rule: a 7 swaps hands with another player, a 0 rotates every hand. */
  sevenZero: boolean;
  /** Cards dealt to each player. */
  handSize: number;
  /** Cards drawn when caught without calling UNO. */
  unoPenalty: number;
}

export const OFFICIAL_RULES: Readonly<Rules> = Object.freeze({
  stacking: false,
  challenges: true,
  drawUntilPlayable: false,
  sevenZero: false,
  handSize: 7,
  unoPenalty: 2,
});

export const HOUSE_RULES: Readonly<Rules> = Object.freeze({
  stacking: true,
  challenges: false,
  drawUntilPlayable: true,
  sevenZero: true,
  handSize: 7,
  unoPenalty: 2,
});

export type RulesPreset = "official" | "house" | "custom";

export function detectPreset(rules: Rules): RulesPreset {
  const same = (a: Rules, b: Rules) =>
    a.stacking === b.stacking &&
    a.challenges === b.challenges &&
    a.drawUntilPlayable === b.drawUntilPlayable &&
    a.sevenZero === b.sevenZero &&
    a.handSize === b.handSize &&
    a.unoPenalty === b.unoPenalty;
  if (same(rules, OFFICIAL_RULES)) return "official";
  if (same(rules, HOUSE_RULES)) return "house";
  return "custom";
}

/** Resolves conflicting options and clamps numbers into sane ranges. */
export function normalizeRules(input: Partial<Rules> | undefined): Rules {
  const rules: Rules = { ...OFFICIAL_RULES, ...(input ?? {}) };
  if (rules.stacking) rules.challenges = false;
  rules.handSize = clampInt(rules.handSize, 3, 10);
  rules.unoPenalty = clampInt(rules.unoPenalty, 0, 4);
  return rules;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export const TARGET_SCORES = [0, 100, 250, 500] as const;
