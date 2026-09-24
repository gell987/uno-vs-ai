const PREFIX = "uno-vs-ai:";

/** Reads and validates a JSON value; any failure yields the fallback. */
export function loadJSON<T>(key: string, sanitize: (raw: unknown) => T | null, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return sanitize(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the game still works, it just won't remember.
  }
}

export function removeKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const pickBool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
export const pickNum = (v: unknown, d: number, min = -Infinity, max = Infinity): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
export function pickEnum<T extends string>(v: unknown, options: readonly T[], d: T): T {
  return typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : d;
}
