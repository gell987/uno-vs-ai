import {
  ALL_CARD_IDS,
  COLORS,
  DECK as SHARED_DECK,
  WILD_COLOR_INDEX,
  handPoints,
  type Card,
  type CardId,
  type Color,
} from "./cards";
import { createRng, shuffleInPlace } from "./rng";
import type { Rules } from "./rules";
import type {
  Action,
  DrawReason,
  LogEntry,
  Phase,
  PlayAction,
  PlayerIndex,
  RoundResult,
  RoundState,
} from "./types";

const TURN: Phase = Object.freeze({ type: "turn" }) as Phase;

// Module-local aliases: bundlers turn imported bindings into getter calls, which
// adds up in the millions of steps an AI search runs.
const DECK: readonly Card[] = SHARED_DECK;
const WILD = WILD_COLOR_INDEX;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function topCard(s: RoundState): Card {
  return DECK[s.discardPile[s.discardPile.length - 1]];
}

export function nextIndex(s: RoundState, from: PlayerIndex, steps = 1): PlayerIndex {
  const n = s.numPlayers;
  return (((from + s.direction * steps) % n) + n) % n;
}

/** Whether a card matches the discard pile when no draw penalty is pending. */
export function matchesTop(s: RoundState, card: Card): boolean {
  if (card.colorIndex === WILD) return true;
  if (s.activeColor === null) return false;
  if (card.color === s.activeColor) return true;
  const top = topCard(s);
  return top.colorIndex !== WILD && top.rank === card.rank;
}

/** Stacking rule: +2 on +2, +4 on +2, +4 on +4. */
export function canStack(s: RoundState, card: Card): boolean {
  const top = topCard(s);
  if (card.rank === "wild4") return top.rank === "draw2" || top.rank === "wild4";
  if (card.rank === "draw2") return top.rank === "draw2";
  return false;
}

/** Whether `cardId` could be played right now by the current player in a normal turn. */
export function isPlayable(s: RoundState, cardId: CardId): boolean {
  const card = DECK[cardId];
  return s.pendingDraw > 0 ? canStack(s, card) : matchesTop(s, card);
}

export function playableCardIds(s: RoundState, player: PlayerIndex): CardId[] {
  return s.hands[player].filter((id) => isPlayable(s, id));
}

export function canDraw(s: RoundState): boolean {
  return s.drawPile.length > 0 || s.discardPile.length > 1;
}

/** The player whose decision the game is waiting on, or null when the round is over. */
export function actor(s: RoundState): PlayerIndex | null {
  return s.phase.type === "roundOver" ? null : s.current;
}

function needsTarget(s: RoundState, player: PlayerIndex, card: Card): boolean {
  return s.rules.sevenZero && card.rank === "7" && s.hands[player].length > 1;
}

function pushPlayVariants(s: RoundState, out: Action[], player: PlayerIndex, cardId: CardId): void {
  const card = DECK[cardId];
  if (card.colorIndex === WILD) {
    for (const color of COLORS) out.push({ type: "play", player, cardId, color });
  } else if (needsTarget(s, player, card)) {
    for (let t = 0; t < s.numPlayers; t++) {
      if (t !== player) out.push({ type: "play", player, cardId, target: t });
    }
  } else {
    out.push({ type: "play", player, cardId });
  }
}

/**
 * Every action the current actor may take. Out-of-turn actions (calling or
 * catching UNO) are not included; see `isLegal`.
 */
export function legalActions(s: RoundState): Action[] {
  const out: Action[] = [];
  const p = s.current;
  switch (s.phase.type) {
    case "roundOver":
      return out;
    case "chooseStartColor":
      for (const color of COLORS) out.push({ type: "chooseColor", player: p, color });
      return out;
    case "challenge":
      out.push({ type: "challenge", player: p }, { type: "accept", player: p });
      return out;
    case "drawnPlayable":
      pushPlayVariants(s, out, p, s.phase.cardId);
      out.push({ type: "keep", player: p });
      return out;
    case "turn": {
      let anyPlayable = false;
      for (const id of s.hands[p]) {
        if (isPlayable(s, id)) {
          anyPlayable = true;
          pushPlayVariants(s, out, p, id);
        }
      }
      if (s.pendingDraw > 0 || canDraw(s)) out.push({ type: "draw", player: p });
      else if (!anyPlayable) out.push({ type: "pass", player: p });
      return out;
    }
  }
}

function validPlayer(s: RoundState, p: unknown): p is PlayerIndex {
  return typeof p === "number" && Number.isInteger(p) && p >= 0 && p < s.numPlayers;
}

export function isLegal(s: RoundState, a: Action): boolean {
  if (s.phase.type === "roundOver" || !a || !validPlayer(s, a.player)) return false;
  const phase = s.phase;
  switch (a.type) {
    case "callUno": {
      if (s.unoCalled[a.player]) return false;
      const size = s.hands[a.player].length;
      return size === 2 || (size === 1 && s.unoVulnerable === a.player);
    }
    case "catchUno":
      return validPlayer(s, a.target) && a.target !== a.player && s.unoVulnerable === a.target;
    default:
      break;
  }
  if (a.player !== s.current) return false;
  switch (a.type) {
    case "play": {
      if (phase.type !== "turn" && phase.type !== "drawnPlayable") return false;
      if (phase.type === "drawnPlayable" && a.cardId !== phase.cardId) return false;
      if (!s.hands[a.player].includes(a.cardId)) return false;
      if (!isPlayable(s, a.cardId)) return false;
      const card = DECK[a.cardId];
      if (card.colorIndex === WILD && !COLORS.includes(a.color as Color)) return false;
      if (needsTarget(s, a.player, card) && (!validPlayer(s, a.target) || a.target === a.player)) return false;
      return true;
    }
    case "draw":
      return phase.type === "turn" && (s.pendingDraw > 0 || canDraw(s));
    case "keep":
      return phase.type === "drawnPlayable";
    case "pass":
      return (
        phase.type === "turn" &&
        s.pendingDraw === 0 &&
        !canDraw(s) &&
        !s.hands[a.player].some((id) => isPlayable(s, id))
      );
    case "chooseColor":
      return phase.type === "chooseStartColor" && COLORS.includes(a.color);
    case "challenge":
    case "accept":
      return phase.type === "challenge";
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Round setup
// ---------------------------------------------------------------------------

export interface RoundOptions {
  numPlayers: number;
  rules: Rules;
  dealer: PlayerIndex;
  seed: number;
  /** Disable logging (simulations). */
  noLog?: boolean;
}

export function createRound(opts: RoundOptions): RoundState {
  const n = opts.numPlayers;
  if (n < 2 || n > 10) throw new Error(`Unsupported player count ${n}`);
  const rng = createRng(opts.seed);
  const deck = shuffleInPlace([...ALL_CARD_IDS], rng);
  const hands: CardId[][] = Array.from({ length: n }, () => []);
  for (let r = 0; r < opts.rules.handSize; r++) {
    for (let k = 1; k <= n; k++) hands[(opts.dealer + k) % n].push(deck.pop()!);
  }
  // Official: a Wild Draw Four can't start the pile; bury it and reshuffle.
  let start = deck.pop()!;
  while (DECK[start].rank === "wild4") {
    deck.push(start);
    shuffleInPlace(deck, rng);
    start = deck.pop()!;
  }
  const startCard = DECK[start];
  const first = (opts.dealer + 1) % n;
  const s: RoundState = {
    numPlayers: n,
    rules: opts.rules,
    dealer: opts.dealer,
    drawPile: deck,
    discardPile: [start],
    hands,
    current: first,
    direction: 1,
    activeColor: startCard.colorIndex === WILD ? null : (startCard.color as Color),
    pendingDraw: 0,
    phase: TURN,
    unoCalled: new Array<boolean>(n).fill(false),
    unoVulnerable: null,
    passStreak: 0,
    seq: 0,
    rng,
    log: opts.noLog ? null : [],
  };
  if (s.log) {
    s.log.push({ t: "deal", dealer: opts.dealer, handSize: opts.rules.handSize, hands: hands.map((h) => [...h]) });
    s.log.push({ t: "start", cardId: start, first });
  }

  switch (startCard.rank) {
    case "wild":
      s.phase = { type: "chooseStartColor" };
      break;
    case "draw2":
      drawCards(s, first, 2, "start");
      log(s, { t: "skip", player: first });
      s.current = nextIndex(s, first);
      break;
    case "skip":
      log(s, { t: "skip", player: first });
      s.current = nextIndex(s, first);
      break;
    case "reverse":
      // The dealer leads and play runs the other way (in a 2-player game this
      // is the same as skipping the first player).
      s.direction = -1;
      log(s, { t: "reverse", direction: -1 });
      s.current = opts.dealer;
      break;
    default:
      break;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function log(s: RoundState, entry: LogEntry): void {
  if (s.log) s.log.push(entry);
}

/** Pops the top of the draw pile, reshuffling the discard pile when needed. */
function takeCard(s: RoundState): CardId | undefined {
  if (s.drawPile.length === 0) {
    if (s.discardPile.length <= 1) return undefined;
    const top = s.discardPile.pop()!;
    const recycled = s.discardPile;
    s.discardPile = [top];
    shuffleInPlace(recycled, s.rng);
    s.drawPile = recycled;
    log(s, { t: "reshuffle", count: recycled.length });
  }
  return s.drawPile.pop();
}

function receiveCards(s: RoundState, p: PlayerIndex, cards: CardId[]): void {
  if (cards.length === 0) return;
  for (const id of cards) s.hands[p].push(id);
  s.unoCalled[p] = false;
  if (s.unoVulnerable === p) s.unoVulnerable = null;
}

function drawCards(s: RoundState, p: PlayerIndex, count: number, reason: DrawReason): CardId[] {
  const drawn: CardId[] = [];
  for (let i = 0; i < count; i++) {
    const id = takeCard(s);
    if (id === undefined) break;
    drawn.push(id);
  }
  receiveCards(s, p, drawn);
  if (s.log) s.log.push({ t: "draw", player: p, count: drawn.length, reason, cards: drawn });
  return drawn;
}

function finishRound(s: RoundState, winner: PlayerIndex | null, reason: "out" | "stalemate"): void {
  const handPts = s.hands.map((h) => handPoints(h));
  let points = 0;
  if (winner !== null) {
    for (let i = 0; i < s.numPlayers; i++) if (i !== winner) points += handPts[i];
  }
  const result: RoundResult = {
    winner,
    points,
    reason,
    hands: s.hands.map((h) => [...h]),
    handPoints: handPts,
  };
  s.phase = { type: "roundOver", result };
  s.unoVulnerable = null;
  s.pendingDraw = 0;
  log(s, { t: "roundOver", winner, points, reason });
}

function stalemate(s: RoundState): void {
  // Nobody can play or draw. Lowest hand value wins; a tie is a draw.
  const pts = s.hands.map((h) => handPoints(h));
  const best = Math.min(...pts);
  const leaders = pts.flatMap((v, i) => (v === best ? [i] : []));
  finishRound(s, leaders.length === 1 ? leaders[0] : null, "stalemate");
}

function resetUnoAfterExchange(s: RoundState): void {
  s.unoVulnerable = null;
  for (let i = 0; i < s.numPlayers; i++) s.unoCalled[i] = s.hands[i].length === 1;
}

function play(s: RoundState, a: PlayAction): void {
  const p = a.player;
  const hand = s.hands[p];
  const card = DECK[a.cardId];
  const swapTarget = needsTarget(s, p, card) ? a.target : undefined;
  hand.splice(hand.indexOf(a.cardId), 1);
  const prevColor = s.activeColor;
  const fromDraw = s.phase.type === "drawnPlayable";

  let guilty = false;
  if (card.rank === "wild4" && prevColor !== null) {
    for (const id of hand) {
      if (DECK[id].color === prevColor) {
        guilty = true;
        break;
      }
    }
  }

  s.discardPile.push(a.cardId);
  s.activeColor = card.colorIndex === WILD ? a.color! : (card.color as Color);
  s.passStreak = 0;
  s.phase = TURN;

  if (hand.length === 1) {
    if (a.uno) s.unoCalled[p] = true;
    if (!s.unoCalled[p]) s.unoVulnerable = p;
  } else {
    s.unoCalled[p] = false;
  }

  if (s.log) {
    const entry: Extract<LogEntry, { t: "play" }> = {
      t: "play",
      player: p,
      cardId: a.cardId,
      color: s.activeColor,
      prevColor,
    };
    if (fromDraw) entry.fromDraw = true;
    if (swapTarget !== undefined) entry.target = swapTarget;
    s.log.push(entry);
    if (a.uno && hand.length === 1) s.log.push({ t: "uno", player: p });
  }

  if (hand.length === 0) {
    // Official: a closing Draw Two / Wild Draw Four still hits the next player,
    // and those cards count toward the winner's score.
    let penalty = s.pendingDraw;
    if (card.rank === "draw2") penalty += 2;
    if (card.rank === "wild4") penalty += 4;
    s.pendingDraw = 0;
    if (penalty > 0) drawCards(s, nextIndex(s, p), penalty, "penalty");
    finishRound(s, p, "out");
    return;
  }

  switch (card.rank) {
    case "skip": {
      const skipped = nextIndex(s, p);
      log(s, { t: "skip", player: skipped });
      s.current = nextIndex(s, p, 2);
      return;
    }
    case "reverse": {
      s.direction = s.direction === 1 ? -1 : 1;
      log(s, { t: "reverse", direction: s.direction });
      if (s.numPlayers === 2) {
        log(s, { t: "skip", player: nextIndex(s, p) });
        s.current = p;
      } else {
        s.current = nextIndex(s, p);
      }
      return;
    }
    case "draw2": {
      const victim = nextIndex(s, p);
      if (s.rules.stacking) {
        s.pendingDraw += 2;
        s.current = victim;
      } else {
        drawCards(s, victim, 2, "penalty");
        log(s, { t: "skip", player: victim });
        s.current = nextIndex(s, p, 2);
      }
      return;
    }
    case "wild4": {
      const victim = nextIndex(s, p);
      if (s.rules.stacking) {
        s.pendingDraw += 4;
        s.current = victim;
      } else if (s.rules.challenges && prevColor !== null) {
        s.phase = { type: "challenge", offender: p, prevColor, guilty };
        s.current = victim;
      } else {
        drawCards(s, victim, 4, "penalty");
        log(s, { t: "skip", player: victim });
        s.current = nextIndex(s, p, 2);
      }
      return;
    }
    case "7": {
      if (swapTarget !== undefined) {
        const t = swapTarget;
        const mine = s.hands[p];
        s.hands[p] = s.hands[t];
        s.hands[t] = mine;
        resetUnoAfterExchange(s);
        const hands: (CardId[] | null)[] = new Array(s.numPlayers).fill(null);
        hands[p] = [...s.hands[p]];
        hands[t] = [...s.hands[t]];
        log(s, { t: "swap", player: p, target: t, hands });
      }
      s.current = nextIndex(s, p);
      return;
    }
    case "0": {
      if (s.rules.sevenZero) {
        const old = s.hands;
        const rotated: CardId[][] = new Array(s.numPlayers);
        for (let i = 0; i < s.numPlayers; i++) rotated[nextIndex(s, i)] = old[i];
        s.hands = rotated;
        resetUnoAfterExchange(s);
        log(s, { t: "rotate", direction: s.direction, hands: rotated.map((h) => [...h]) });
      }
      s.current = nextIndex(s, p);
      return;
    }
    default:
      s.current = nextIndex(s, p);
  }
}

function draw(s: RoundState, p: PlayerIndex): void {
  if (s.pendingDraw > 0) {
    const n = s.pendingDraw;
    s.pendingDraw = 0;
    drawCards(s, p, n, "stack");
    log(s, { t: "skip", player: p });
    s.current = nextIndex(s, p);
    return;
  }
  s.passStreak = 0;
  let playableId: CardId | undefined;
  if (s.rules.drawUntilPlayable) {
    const drawn: CardId[] = [];
    for (;;) {
      const id = takeCard(s);
      if (id === undefined) break;
      drawn.push(id);
      if (matchesTop(s, DECK[id])) {
        playableId = id;
        break;
      }
    }
    receiveCards(s, p, drawn);
    log(s, { t: "draw", player: p, count: drawn.length, reason: "turn", cards: drawn });
  } else {
    const [id] = drawCards(s, p, 1, "turn");
    if (id !== undefined && matchesTop(s, DECK[id])) playableId = id;
  }
  if (playableId !== undefined) {
    s.phase = { type: "drawnPlayable", cardId: playableId };
    return;
  }
  log(s, { t: "endTurn", player: p });
  s.current = nextIndex(s, p);
}

/**
 * Applies an action in place without validation. Callers must pass a legal
 * action (see `isLegal`). Used directly by AI simulations for speed.
 */
export function applyUnchecked(s: RoundState, a: Action): void {
  s.seq++;
  switch (a.type) {
    case "callUno":
      s.unoCalled[a.player] = true;
      if (s.unoVulnerable === a.player) s.unoVulnerable = null;
      log(s, { t: "uno", player: a.player });
      return;
    case "catchUno":
      s.unoVulnerable = null;
      log(s, { t: "caught", player: a.player, target: a.target });
      drawCards(s, a.target, s.rules.unoPenalty, "uno");
      return;
    default:
      break;
  }

  // The next player acting closes the window for catching a missed UNO.
  s.unoVulnerable = null;
  const p = a.player;

  switch (a.type) {
    case "play":
      play(s, a);
      return;
    case "draw":
      draw(s, p);
      return;
    case "keep":
      s.phase = TURN;
      log(s, { t: "endTurn", player: p });
      s.current = nextIndex(s, p);
      return;
    case "pass":
      s.passStreak++;
      log(s, { t: "pass", player: p });
      if (s.passStreak >= s.numPlayers) stalemate(s);
      else s.current = nextIndex(s, p);
      return;
    case "chooseColor":
      s.activeColor = a.color;
      s.phase = TURN;
      log(s, { t: "color", player: p, color: a.color });
      return;
    case "challenge": {
      if (s.phase.type !== "challenge") return;
      const { offender, guilty, prevColor } = s.phase;
      log(s, { t: "reveal", to: p, player: offender, cards: [...s.hands[offender]] });
      log(s, { t: "challenge", player: p, offender, guilty, color: prevColor });
      s.phase = TURN;
      if (guilty) {
        drawCards(s, offender, 4, "challenge");
        s.current = p;
      } else {
        drawCards(s, p, 6, "challenge");
        log(s, { t: "skip", player: p });
        s.current = nextIndex(s, p);
      }
      return;
    }
    case "accept":
      s.phase = TURN;
      drawCards(s, p, 4, "penalty");
      log(s, { t: "skip", player: p });
      s.current = nextIndex(s, p);
      return;
  }
}

export function cloneRound(s: RoundState): RoundState {
  return {
    ...s,
    drawPile: s.drawPile.slice(),
    discardPile: s.discardPile.slice(),
    hands: s.hands.map((h) => h.slice()),
    unoCalled: s.unoCalled.slice(),
    rng: [s.rng[0], s.rng[1], s.rng[2], s.rng[3]],
    log: s.log ? s.log.slice() : null,
  };
}

export interface ApplyResult {
  state: RoundState;
  /** Log entries produced by this action. */
  entries: LogEntry[];
}

/** Validates and applies an action, returning a new state (or null if illegal). */
export function applyAction(s: RoundState, a: Action): ApplyResult | null {
  if (!isLegal(s, a)) return null;
  const next = cloneRound(s);
  const before = next.log ? next.log.length : 0;
  applyUnchecked(next, a);
  return { state: next, entries: next.log ? next.log.slice(before) : [] };
}
