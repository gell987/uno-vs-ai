import { PERSONAS, observeEntries, type DecisionAnalysis, type DecisionContext, type HandRead, type OpponentProfile } from "@/lib/ai";
import { AiClient } from "@/lib/ai/client";
import {
  applyMatchAction,
  createMatch,
  createRng,
  getPlayerView,
  legalActions,
  nextFloat,
  nextU32,
  randomSeed,
  startNextRound,
  type Action,
  type Difficulty,
  type LogEntry,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
} from "@/lib/uno";
import { chatterFor } from "./chatter";
import { SPEED_FACTOR, type Settings } from "./settings";

export interface Bubble {
  id: number;
  player: PlayerIndex;
  text: string;
}

export interface LastDecision {
  player: PlayerIndex;
  action: Action;
  analysis: DecisionAnalysis;
  seq: number;
}

export interface Hint {
  action: Action;
  winProbability?: number;
  seq: number;
}

export interface Snapshot {
  match: MatchState | null;
  /** The AI seat currently thinking, if any. */
  thinking: PlayerIndex | null;
  lastDecision: LastDecision | null;
  /** What the strongest AI at the table believes about the human's hand. */
  handRead: HandRead | null;
  hint: Hint | null;
  hintPending: boolean;
  bubbles: Bubble[];
}

export type ControllerEvent =
  | { type: "entries"; entries: LogEntry[]; match: MatchState; actor: PlayerIndex }
  | { type: "illegal"; action: Action }
  | { type: "roundStart"; match: MatchState };

export interface ControllerHooks {
  getSettings: () => Settings;
  getProfile: () => OpponentProfile;
  setProfile: (p: OpponentProfile) => void;
  onEntries?: (entries: LogEntry[], match: MatchState) => void;
  onSave?: (match: MatchState | null) => void;
}

const ORDER: Record<Difficulty, number> = { rookie: 0, casual: 1, shark: 2, grandmaster: 3 };
const SEARCH_BUDGET = { relaxed: 900, normal: 650, fast: 380 } as const;
const HUMAN: PlayerIndex = 0;

type Timer = ReturnType<typeof setTimeout>;

/**
 * Owns the match and everything time-based around it: AI thinking, pacing,
 * the race to call or catch a missed UNO, chatter and hints. React subscribes
 * via `subscribe`/`getSnapshot` (useSyncExternalStore).
 *
 * Every scheduled callback carries the token that was current when it was
 * scheduled; any state change bumps the token, so stale AI moves or catches
 * can never land on a newer position.
 */
export class GameController {
  private snapshot: Snapshot = {
    match: null,
    thinking: null,
    lastDecision: null,
    handRead: null,
    hint: null,
    hintPending: false,
    bubbles: [],
  };
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: ControllerEvent) => void>();
  private timers = new Set<Timer>();
  private bubbleTimers = new Set<Timer>();
  private token = 0;
  private bubbleId = 0;
  private rng = createRng(randomSeed());
  private ai: AiClient | null = null;
  /** Reasons the game is paused (menu open, settings open, ...). */
  private pauses = new Set<string>();
  private hintRequest = 0;

  constructor(private hooks: ControllerHooks) {}

  // -- store plumbing ----------------------------------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  onEvent(fn: (e: ControllerEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  private set(partial: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const l of this.listeners) l();
  }

  private emit(e: ControllerEvent): void {
    for (const l of this.eventListeners) l(e);
  }

  private client(): AiClient {
    if (!this.ai) this.ai = new AiClient();
    return this.ai;
  }

  dispose(): void {
    this.clearTimers();
    for (const t of this.bubbleTimers) clearTimeout(t);
    this.bubbleTimers.clear();
    this.ai?.dispose();
    this.ai = null;
    this.listeners.clear();
    this.eventListeners.clear();
  }

  // -- lifecycle ---------------------------------------------------------------

  load(match: MatchState): void {
    this.set({ match, thinking: null, lastDecision: null, handRead: null, hint: null, hintPending: false, bubbles: [] });
    this.emit({ type: "roundStart", match });
    this.schedule();
  }

  newMatch(config: MatchConfig): void {
    const match = createMatch(config, randomSeed());
    this.hooks.onSave?.(match);
    this.load(match);
  }

  nextRound(): void {
    const m = this.snapshot.match;
    if (!m || m.over || m.round.phase.type !== "roundOver") return;
    const next = startNextRound(m);
    this.set({ match: next, hint: null, handRead: null, lastDecision: null });
    this.hooks.onSave?.(next);
    this.emit({ type: "roundStart", match: next });
    this.schedule();
  }

  quit(): void {
    this.clearTimers();
    this.token++;
    this.set({ match: null, thinking: null, hint: null, hintPending: false, handRead: null, lastDecision: null, bubbles: [] });
  }

  /** Pauses AI activity while `reason` holds (a menu or dialog is open). */
  pause(reason: string): void {
    const wasRunning = this.pauses.size === 0;
    this.pauses.add(reason);
    if (wasRunning) {
      this.clearTimers();
      this.token++;
      if (this.snapshot.thinking !== null) this.set({ thinking: null });
    }
  }

  resume(reason: string): void {
    if (!this.pauses.delete(reason)) return;
    if (this.pauses.size === 0) this.schedule();
  }

  /** Re-evaluates timers after settings change (speed, insights). */
  refresh(): void {
    this.schedule();
  }

  // -- actions -----------------------------------------------------------------

  /** Human input. Returns false (and emits "illegal") if the move is not allowed. */
  act(action: Action): boolean {
    const m = this.snapshot.match;
    if (!m || action.player !== HUMAN) return false;
    let a = action;
    if (a.type === "play" && this.hooks.getSettings().autoUno && m.round.hands[HUMAN].length === 2) a = { ...a, uno: true };
    return this.apply(a);
  }

  private apply(action: Action): boolean {
    const m = this.snapshot.match;
    if (!m) return false;
    const res = applyMatchAction(m, action);
    if (!res) {
      if (action.player === HUMAN) this.emit({ type: "illegal", action });
      return false;
    }
    this.hooks.setProfile(observeEntries(this.hooks.getProfile(), res.entries, res.match.round, HUMAN));
    this.hooks.onEntries?.(res.entries, res.match);
    this.set({
      match: res.match,
      hint: null,
      hintPending: false,
      thinking: null,
    });
    this.emit({ type: "entries", entries: res.entries, match: res.match, actor: action.player });
    this.addChatter(res.entries, res.match);
    this.hooks.onSave?.(res.match);
    this.schedule();
    return true;
  }

  // -- scheduling --------------------------------------------------------------

  private after(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, Math.max(0, ms));
    this.timers.add(t);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private isAi(p: PlayerIndex): boolean {
    return this.snapshot.match?.config.players[p]?.kind === "ai";
  }

  private difficultyOf = (p: PlayerIndex): Difficulty | null => {
    const player = this.snapshot.match?.config.players[p];
    return player && player.kind === "ai" ? player.difficulty : null;
  };

  private rand = (): number => nextFloat(this.rng);

  private between([lo, hi]: [number, number]): number {
    return lo + (hi - lo) * this.rand();
  }

  contextFor(p: PlayerIndex, difficulty?: Difficulty): DecisionContext {
    const m = this.snapshot.match!;
    const settings = this.hooks.getSettings();
    return {
      view: getPlayerView(m.round, p),
      difficulty: difficulty ?? m.config.players[p].difficulty,
      seed: nextU32(this.rng),
      human: HUMAN,
      profile: this.hooks.getProfile(),
      seats: m.config.players.map((pl) => (pl.kind === "ai" ? pl.difficulty : null)),
      budgetMs: SEARCH_BUDGET[settings.speed],
    };
  }

  private schedule(): void {
    this.clearTimers();
    const token = ++this.token;
    const m = this.snapshot.match;
    if (!m || this.pauses.size > 0) return;
    const r = m.round;
    if (r.phase.type === "roundOver") {
      if (this.snapshot.thinking !== null) this.set({ thinking: null });
      return;
    }
    const settings = this.hooks.getSettings();
    const speed = SPEED_FACTOR[settings.speed];
    const live = () => token === this.token;

    const actor = r.current;

    // The race to call or catch a missed UNO. Moving closes the window, so an AI
    // that means to catch someone does it before taking its own turn.
    let minPace = 0;
    const v = r.unoVulnerable;
    if (v !== null) {
      if (this.isAi(v)) {
        const persona = PERSONAS[this.difficultyOf(v)!];
        if (this.rand() < persona.lateCall) {
          this.after(this.between(persona.reactionMs) * 1.2, () => live() && this.apply({ type: "callUno", player: v }));
        }
        // Give the human a fair chance to spot it before the next AI moves.
        if (actor !== HUMAN) minPace = 2300 * speed;
      }
      for (let q = 0; q < m.config.players.length; q++) {
        if (q === v || !this.isAi(q)) continue;
        const persona = PERSONAS[this.difficultyOf(q)!];
        if (this.rand() < persona.catchChance) {
          const at = this.between(persona.reactionMs);
          this.after(at, () => live() && this.apply({ type: "catchUno", player: q, target: v }));
          if (q === actor) minPace = Math.max(minPace, at + 250);
        }
      }
    }

    if (!this.isAi(actor)) {
      if (this.snapshot.thinking !== null) this.set({ thinking: null });
      if (settings.showInsights) this.refreshHandRead(token);
      return;
    }

    const persona = PERSONAS[this.difficultyOf(actor)!];
    const pace = Math.max(minPace, this.between(persona.thinkMs) * speed);
    const started = Date.now();
    this.set({ thinking: actor });
    const ctx = this.contextFor(actor);
    this.client()
      .decide(ctx)
      .then((decision) => {
        if (!live()) return;
        this.after(pace - (Date.now() - started), () => {
          if (!live()) return;
          if (decision.analysis) {
            this.set({ lastDecision: { player: actor, action: decision.action, analysis: decision.analysis, seq: r.seq } });
          }
          if (!this.apply(decision.action)) this.applyFallback(actor);
        });
      })
      .catch(() => {
        if (live()) this.after(pace, () => live() && this.applyFallback(actor));
      });
  }

  /** Safety net: should an AI ever fail, it still makes a legal move. */
  private applyFallback(actor: PlayerIndex): void {
    const m = this.snapshot.match;
    if (!m || m.round.current !== actor) return;
    const actions = legalActions(m.round);
    if (actions.length) this.apply(actions[0]);
  }

  private refreshHandRead(token: number): void {
    const m = this.snapshot.match;
    if (!m) return;
    let observer: PlayerIndex | null = null;
    m.config.players.forEach((p, i) => {
      if (p.kind === "ai" && (observer === null || ORDER[p.difficulty] > ORDER[m.config.players[observer].difficulty])) observer = i;
    });
    if (observer === null) return;
    this.client()
      .read(this.contextFor(observer), HUMAN)
      .then((read) => {
        if (token === this.token) this.set({ handRead: read });
      })
      .catch(() => {});
  }

  /** Asks the Grandmaster what it would do in the human's shoes. */
  requestHint(): void {
    const m = this.snapshot.match;
    if (!m || m.round.current !== HUMAN || m.round.phase.type === "roundOver" || this.snapshot.hintPending) return;
    const request = ++this.hintRequest;
    const seq = m.round.seq;
    this.set({ hintPending: true });
    const finish = (hint: Hint | null) => {
      if (request !== this.hintRequest) return;
      // A hint only applies to the exact position it was computed for.
      const current = this.snapshot.match?.round.seq === seq;
      this.set({ hint: current ? hint : null, hintPending: false });
    };
    this.client()
      .decide({ ...this.contextFor(HUMAN, "grandmaster"), budgetMs: 700 })
      .then((d) => finish({ action: d.action, winProbability: d.analysis?.winProbability, seq }))
      .catch(() => finish(null));
  }

  // -- chatter -----------------------------------------------------------------

  private addChatter(entries: LogEntry[], match: MatchState): void {
    if (!this.hooks.getSettings().chatter) return;
    const lines = chatterFor(entries, this.difficultyOf, this.rand);
    if (!lines.length) return;
    const fresh: Bubble[] = lines.map((l) => ({ id: ++this.bubbleId, player: l.player, text: l.text }));
    const kept = this.snapshot.bubbles.filter((b) => !fresh.some((f) => f.player === b.player));
    this.set({ bubbles: [...kept, ...fresh] });
    const duration = match.round.phase.type === "roundOver" ? 3800 : 2600;
    for (const b of fresh) {
      const t = setTimeout(() => {
        this.bubbleTimers.delete(t);
        this.set({ bubbles: this.snapshot.bubbles.filter((x) => x.id !== b.id) });
      }, duration);
      this.bubbleTimers.add(t);
    }
  }
}
