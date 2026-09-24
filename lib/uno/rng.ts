/**
 * Small, fast, seedable PRNG (sfc32) whose entire state is a plain 4-tuple, so
 * it can live inside serializable game state. Deterministic seeds make games
 * replayable and tests reproducible.
 */

export type RngState = [number, number, number, number];

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createRng(seed: number): RngState {
  const next = splitmix32(seed);
  const state: RngState = [next(), next(), next(), next()];
  // Warm up so that similar seeds diverge quickly.
  for (let i = 0; i < 12; i++) nextU32(state);
  return state;
}

/** Advances the state in place and returns an unsigned 32-bit integer. */
export function nextU32(s: RngState): number {
  let a = s[0];
  let b = s[1];
  let c = s[2];
  let d = s[3];
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a;
  s[1] = b;
  s[2] = c;
  s[3] = d;
  return t >>> 0;
}

/** Uniform float in [0, 1). */
export function nextFloat(s: RngState): number {
  return nextU32(s) / 4294967296;
}

/** Uniform integer in [0, n). */
export function nextInt(s: RngState, n: number): number {
  return Math.floor(nextFloat(s) * n);
}

/** Unbiased in-place Fisher–Yates shuffle. */
export function shuffleInPlace<T>(items: T[], s: RngState): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(s, i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

export function pick<T>(items: readonly T[], s: RngState): T {
  return items[nextInt(s, items.length)];
}

/** A fresh 32-bit seed from the best entropy source available. */
export function randomSeed(): number {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    return cryptoObj.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** Derives an independent seed from a base seed and a salt. */
export function deriveSeed(base: number, salt: number): number {
  const next = splitmix32((base ^ Math.imul(salt + 1, 0x27d4eb2d)) >>> 0);
  next();
  return next();
}
