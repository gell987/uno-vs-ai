import { DIFFICULTIES, OFFICIAL_RULES, TARGET_SCORES, normalizeRules, type Difficulty, type Rules } from "@/lib/uno";
import { isRecord, pickBool, pickEnum, pickNum } from "./storage";

export const SPEEDS = ["relaxed", "normal", "fast"] as const;
export type Speed = (typeof SPEEDS)[number];

export const FELTS = ["emerald", "ocean", "violet", "crimson", "graphite"] as const;
export type Felt = (typeof FELTS)[number];

export interface Settings {
  sound: boolean;
  volume: number;
  voice: boolean;
  haptics: boolean;
  speed: Speed;
  hints: boolean;
  colorblind: boolean;
  chatter: boolean;
  autoUno: boolean;
  showInsights: boolean;
  felt: Felt;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  volume: 0.7,
  voice: true,
  haptics: true,
  speed: "normal",
  hints: true,
  colorblind: false,
  chatter: true,
  autoUno: false,
  showInsights: true,
  felt: "emerald",
};

export function sanitizeSettings(raw: unknown): Settings | null {
  if (!isRecord(raw)) return null;
  const d = DEFAULT_SETTINGS;
  return {
    sound: pickBool(raw.sound, d.sound),
    volume: pickNum(raw.volume, d.volume, 0, 1),
    voice: pickBool(raw.voice, d.voice),
    haptics: pickBool(raw.haptics, d.haptics),
    speed: pickEnum(raw.speed, SPEEDS, d.speed),
    hints: pickBool(raw.hints, d.hints),
    colorblind: pickBool(raw.colorblind, d.colorblind),
    chatter: pickBool(raw.chatter, d.chatter),
    autoUno: pickBool(raw.autoUno, d.autoUno),
    showInsights: pickBool(raw.showInsights, d.showInsights),
    felt: pickEnum(raw.felt, FELTS, d.felt),
  };
}

export const SPEED_FACTOR: Record<Speed, number> = { relaxed: 1.45, normal: 1, fast: 0.55 };

/** What the player picked in the lobby, remembered for next time. */
export interface Setup {
  playerName: string;
  opponents: Difficulty[];
  rules: Rules;
  targetScore: number;
}

export const DEFAULT_SETUP: Setup = {
  playerName: "You",
  opponents: ["shark"],
  rules: { ...OFFICIAL_RULES },
  targetScore: 250,
};

export function sanitizeSetup(raw: unknown): Setup | null {
  if (!isRecord(raw)) return null;
  const opponents = Array.isArray(raw.opponents)
    ? raw.opponents.filter((d): d is Difficulty => typeof d === "string" && (DIFFICULTIES as readonly string[]).includes(d)).slice(0, 3)
    : [];
  const name = typeof raw.playerName === "string" ? raw.playerName.trim().slice(0, 16) : "";
  const target = pickNum(raw.targetScore, DEFAULT_SETUP.targetScore);
  return {
    playerName: name || DEFAULT_SETUP.playerName,
    opponents: opponents.length ? opponents : DEFAULT_SETUP.opponents,
    rules: normalizeRules(isRecord(raw.rules) ? (raw.rules as Partial<Rules>) : undefined),
    targetScore: (TARGET_SCORES as readonly number[]).includes(target) ? target : DEFAULT_SETUP.targetScore,
  };
}
