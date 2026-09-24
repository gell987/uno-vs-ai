"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PROFILE, sanitizeProfile, type OpponentProfile } from "@/lib/ai";
import type { MatchState } from "@/lib/uno";
import { DEFAULT_SETTINGS, DEFAULT_SETUP, sanitizeSettings, sanitizeSetup, type Settings, type Setup } from "./settings";
import { EMPTY_STATS, sanitizeStats, type Stats } from "./stats";
import { isRecord, loadJSON, removeKey, saveJSON } from "./storage";

type Updater<T> = T | ((prev: T) => T);

export interface PersistentStore<T> {
  get: () => T;
  getServer: () => T;
  set: (next: Updater<T>) => void;
  subscribe: (fn: () => void) => () => void;
}

/**
 * A tiny external store backed by localStorage. Components read it through
 * useSyncExternalStore, so the server render uses defaults and the client
 * picks up saved values right after hydration, without effects.
 */
function persistentStore<T>(key: string, sanitize: (raw: unknown) => T | null, fallback: T, debounceMs = 0): PersistentStore<T> {
  let value: T | undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const get = () => {
    if (value === undefined) value = loadJSON(key, sanitize, fallback);
    return value;
  };
  const write = () => {
    timer = null;
    if (value === null || value === undefined) removeKey(key);
    else saveJSON(key, value);
  };
  return {
    get,
    getServer: () => fallback,
    set(next) {
      value = typeof next === "function" ? (next as (p: T) => T)(get()) : next;
      if (debounceMs > 0) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(write, debounceMs);
      } else {
        write();
      }
      for (const l of listeners) l();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function sanitizeMatch(raw: unknown): MatchState | null {
  // Structural sanity checks; anything odd is discarded rather than risked.
  if (!isRecord(raw) || !isRecord(raw.config) || !isRecord(raw.round)) return null;
  const players = (raw.config as Record<string, unknown>).players;
  const round = raw.round as Record<string, unknown>;
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) return null;
  if (!Array.isArray(round.hands) || round.hands.length !== players.length) return null;
  if (!Array.isArray(round.drawPile) || !Array.isArray(round.discardPile) || !Array.isArray(raw.scores)) return null;
  const total = (round.drawPile as unknown[]).length + (round.discardPile as unknown[]).length + (round.hands as unknown[][]).reduce((a, h) => a + (Array.isArray(h) ? h.length : 999), 0);
  if (total !== 108) return null;
  return raw as unknown as MatchState;
}

export const settingsStore = persistentStore<Settings>("settings", sanitizeSettings, DEFAULT_SETTINGS);
export const setupStore = persistentStore<Setup>("setup", sanitizeSetup, DEFAULT_SETUP);
export const statsStore = persistentStore<Stats>("stats", sanitizeStats, EMPTY_STATS);
export const profileStore = persistentStore<OpponentProfile>("profile", sanitizeProfile, DEFAULT_PROFILE);
export const matchStore = persistentStore<MatchState | null>("match", sanitizeMatch, null, 250);

export function useStore<T>(store: PersistentStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}
