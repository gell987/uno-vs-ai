import { applyAction, createRound } from "./engine";
import { deriveSeed } from "./rng";
import { normalizeRules } from "./rules";
import type { Action, LogEntry, MatchConfig, MatchState } from "./types";

export function normalizeConfig(config: MatchConfig): MatchConfig {
  const players = config.players.slice(0, 4);
  if (players.length < 2) throw new Error("A match needs at least two players");
  const target = Number.isFinite(config.targetScore) ? Math.max(0, Math.round(config.targetScore)) : 0;
  return { players, rules: normalizeRules(config.rules), targetScore: target };
}

export function createMatch(config: MatchConfig, seed: number): MatchState {
  const cfg = normalizeConfig(config);
  const n = cfg.players.length;
  // The last seat deals first so that seat 0 (the human) leads round one.
  const round = createRound({ numPlayers: n, rules: cfg.rules, dealer: n - 1, seed: deriveSeed(seed, 1) });
  return {
    config: cfg,
    seed,
    scores: new Array<number>(n).fill(0),
    roundNumber: 1,
    round,
    history: [],
    winner: null,
    over: false,
  };
}

export interface MatchApplyResult {
  match: MatchState;
  entries: LogEntry[];
}

export function applyMatchAction(m: MatchState, a: Action): MatchApplyResult | null {
  if (m.over) return null;
  const res = applyAction(m.round, a);
  if (!res) return null;
  let match: MatchState = { ...m, round: res.state };
  const phase = res.state.phase;
  if (phase.type === "roundOver" && m.round.phase.type !== "roundOver") {
    const { winner, points, reason } = phase.result;
    const scores = m.scores.slice();
    if (winner !== null) scores[winner] += points;
    const target = m.config.targetScore;
    const over = target === 0 || (winner !== null && scores[winner] >= target);
    match = {
      ...match,
      scores,
      history: [...m.history, { round: m.roundNumber, winner, points, reason }],
      over,
      winner: over ? winner : null,
    };
  }
  return { match, entries: res.entries };
}

export function startNextRound(m: MatchState): MatchState {
  if (m.over || m.round.phase.type !== "roundOver") return m;
  const n = m.config.players.length;
  const roundNumber = m.roundNumber + 1;
  const round = createRound({
    numPlayers: n,
    rules: m.config.rules,
    dealer: (m.round.dealer + 1) % n,
    seed: deriveSeed(m.seed, roundNumber),
  });
  return { ...m, roundNumber, round };
}
