import { DECK, WILD_COLOR_INDEX, type Color, type LogEntry, type PlayerIndex, type RoundState } from "@/lib/uno";

/**
 * What the AI opponents learn about the human over time. Every field is based
 * only on information an opponent at the table could observe: public plays,
 * challenge outcomes and UNO calls. Nothing is learned from hidden cards.
 */
export interface OpponentProfile {
  version: 1;
  /** Wild Draw Fours an AI played at the human while challenges were enabled. */
  wd4Faced: number;
  /** ...how many of those the human challenged. */
  wd4Challenged: number;
  /** Times an AI challenged the human's Wild Draw Four. */
  challengedByAi: number;
  /** ...how many of those caught the human bluffing. */
  caughtBluffing: number;
  /** After choosing a color with a wild, how often the human's next colored card matched it. */
  wildFollowTotal: number;
  wildFollowHits: number;
  /** Times the human went down to one card, and times they forgot to call UNO. */
  unoChances: number;
  unoMisses: number;
  /** Times the human caught an AI that forgot UNO. */
  catches: number;
  roundsObserved: number;
  /** Transient: the color the human last chose with a wild. */
  pendingWildColor: Color | null;
}

export const DEFAULT_PROFILE: OpponentProfile = Object.freeze({
  version: 1,
  wd4Faced: 0,
  wd4Challenged: 0,
  challengedByAi: 0,
  caughtBluffing: 0,
  wildFollowTotal: 0,
  wildFollowHits: 0,
  unoChances: 0,
  unoMisses: 0,
  catches: 0,
  roundsObserved: 0,
  pendingWildColor: null,
}) as OpponentProfile;

export function sanitizeProfile(input: unknown): OpponentProfile {
  const base: OpponentProfile = { ...DEFAULT_PROFILE };
  if (!input || typeof input !== "object") return base;
  const src = input as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof OpponentProfile)[]) {
    if (key === "version" || key === "pendingWildColor") continue;
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) (base as unknown as Record<string, number>)[key] = Math.floor(v);
  }
  return base;
}

/** Probability that the human challenges a Wild Draw Four (Beta prior centered on 30%). */
export function challengeRate(p: OpponentProfile): number {
  return (p.wd4Challenged + 1.5) / (p.wd4Faced + 5);
}

/** Estimated share of the human's challenged Wild Draw Fours that were bluffs (prior 40%). */
export function bluffRate(p: OpponentProfile): number {
  return (p.caughtBluffing + 2) / (p.challengedByAi + 5);
}

/**
 * Combines "how likely are they to hold the color right now" with the human's
 * track record: a history of bluffing shifts the estimate up, honesty down.
 */
export function guiltEstimate(pHasColor: number, p: OpponentProfile): number {
  const logit = (x: number) => Math.log(x / (1 - x));
  const clamp = (x: number) => Math.min(0.98, Math.max(0.02, x));
  const n = p.challengedByAi;
  const weight = n / (n + 3);
  const shift = (logit(clamp(bluffRate(p))) - logit(0.4)) * weight;
  const z = logit(clamp(pHasColor)) + shift;
  return 1 / (1 + Math.exp(-z));
}

/** How strongly to believe the human holds the color they last chose with a wild. */
export function wildFollowStrength(p: OpponentProfile): number {
  return (p.wildFollowHits + 3) / (p.wildFollowTotal + 5);
}

export function unoMissRate(p: OpponentProfile): number {
  return (p.unoMisses + 0.5) / (p.unoChances + 5);
}

/** Updates the profile from the entries produced by one action. */
export function observeEntries(
  profile: OpponentProfile,
  entries: readonly LogEntry[],
  after: RoundState,
  human: PlayerIndex,
): OpponentProfile {
  let p = profile;
  const edit = () => {
    if (p === profile) p = { ...profile };
    return p;
  };
  for (const e of entries) {
    switch (e.t) {
      case "play": {
        const card = DECK[e.cardId];
        if (e.player === human) {
          const q = edit();
          if (card.colorIndex === WILD_COLOR_INDEX) {
            q.pendingWildColor = e.color;
          } else if (q.pendingWildColor) {
            q.wildFollowTotal++;
            if (card.color === q.pendingWildColor) q.wildFollowHits++;
            q.pendingWildColor = null;
          }
          if (after.hands[human].length === 1) {
            q.unoChances++;
            if (after.unoVulnerable === human) q.unoMisses++;
          }
        } else if (
          card.rank === "wild4" &&
          after.phase.type === "challenge" &&
          after.phase.offender === e.player &&
          after.current === human
        ) {
          edit().wd4Faced++;
        }
        break;
      }
      case "challenge":
        if (e.player === human) edit().wd4Challenged++;
        if (e.offender === human) {
          const q = edit();
          q.challengedByAi++;
          if (e.guilty) q.caughtBluffing++;
        }
        break;
      case "caught":
        if (e.player === human) edit().catches++;
        break;
      case "roundOver": {
        const q = edit();
        q.roundsObserved++;
        q.pendingWildColor = null;
        break;
      }
      default:
        break;
    }
  }
  return p;
}
