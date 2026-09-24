import {
  ALL_CARD_IDS,
  COLORS,
  DECK,
  WILD_COLOR_INDEX,
  type CardId,
  type Color,
  type PlayerIndex,
  type PlayerView,
} from "@/lib/uno";

/**
 * A group of unknown cards in an opponent's hand that share the same
 * constraints. For example: "the 5 cards they held when they drew on a red 7
 * contain no red, no 7 and no wild", plus "1 card drawn since then: anything".
 */
export interface Segment {
  count: number;
  /** Bitmask over color indices (bit 4 = wild cards) this group cannot contain. */
  colorMask: number;
  /** Bitmask over rank indices this group cannot contain. */
  rankMask: number;
}

export interface OpponentModel {
  /** Cards we know for certain are in this hand (e.g. after a swap or a challenge reveal). */
  known: CardId[];
  segments: Segment[];
  /** A color they recently chose with a wild and have not played since: they likely hold it. */
  hintColor: Color | null;
}

export interface Beliefs {
  me: PlayerIndex;
  models: OpponentModel[];
  /** Cards whose location is unknown to `me`: in opponents' hands or the draw pile. */
  unknownPool: CardId[];
}

export function allowedIn(seg: Segment, id: CardId): boolean {
  const c = DECK[id];
  return (seg.colorMask & (1 << c.colorIndex)) === 0 && (seg.rankMask & (1 << c.rankIndex)) === 0;
}

const colorBit = (color: Color) => 1 << COLORS.indexOf(color);
const WILD_BIT = 1 << WILD_COLOR_INDEX;
const DRAW2_BIT = 1 << DECK.find((c) => c.rank === "draw2")!.rankIndex;
const WILD4_BIT = 1 << DECK.find((c) => c.rank === "wild4")!.rankIndex;

interface Mask {
  colorMask: number;
  rankMask: number;
}

/** Constraint for "had nothing playable on this top card / color". */
export function unplayableMask(activeColor: Color | null, top: CardId | null): Mask {
  let colorMask = WILD_BIT;
  let rankMask = 0;
  if (activeColor) colorMask |= colorBit(activeColor);
  if (top !== null) {
    const card = DECK[top];
    if (card.colorIndex !== WILD_COLOR_INDEX) rankMask |= 1 << card.rankIndex;
  }
  return { colorMask, rankMask };
}

function emptyModel(): OpponentModel {
  return { known: [], segments: [], hintColor: null };
}

function applyMask(model: OpponentModel, mask: Mask): void {
  for (const seg of model.segments) {
    seg.colorMask |= mask.colorMask;
    seg.rankMask |= mask.rankMask;
  }
  if (model.hintColor && mask.colorMask & colorBit(model.hintColor)) model.hintColor = null;
}

function removeCard(model: OpponentModel, id: CardId, preferred?: Segment | null): void {
  const k = model.known.indexOf(id);
  if (k >= 0) {
    model.known.splice(k, 1);
    return;
  }
  let target: Segment | null = null;
  if (preferred && preferred.count > 0 && model.segments.includes(preferred)) {
    target = preferred;
  } else {
    for (const seg of model.segments) {
      if (seg.count > 0 && allowedIn(seg, id) && (!target || seg.count >= target.count)) target = seg;
    }
  }
  if (!target) {
    // They played something we believed they could not hold (e.g. a deliberate
    // draw while holding a playable card). Drop the wrong constraint.
    for (const seg of model.segments) if (seg.count > 0 && (!target || seg.count > target.count)) target = seg;
    if (!target) return;
    target.colorMask = 0;
    target.rankMask = 0;
  }
  target.count--;
  model.segments = model.segments.filter((s) => s.count > 0);
}

function cloneModel(m: OpponentModel): OpponentModel {
  return { known: [...m.known], segments: m.segments.map((s) => ({ ...s })), hintColor: m.hintColor };
}

/**
 * Replays everything `view.me` has seen this round and returns what they can
 * infer about every other hand. Only the player's own view is used, so the
 * result never depends on hidden information.
 */
export function buildBeliefs(view: PlayerView): Beliefs {
  const n = view.numPlayers;
  const me = view.me;
  let models: OpponentModel[] = Array.from({ length: n }, emptyModel);
  let myHand: CardId[] = [];
  let activeColor: Color | null = null;
  let top: CardId | null = null;
  let lastTurnDraw: { player: PlayerIndex; segment: Segment } | null = null;

  for (const e of view.log) {
    switch (e.t) {
      case "deal":
        models = Array.from({ length: n }, (_, p) =>
          p === me ? emptyModel() : { known: [], segments: [{ count: e.handSize, colorMask: 0, rankMask: 0 }], hintColor: null },
        );
        myHand = [...(e.hands[me] ?? [])];
        break;
      case "start":
        top = e.cardId;
        activeColor = DECK[e.cardId].colorIndex === WILD_COLOR_INDEX ? null : (DECK[e.cardId].color as Color);
        break;
      case "color":
        activeColor = e.color;
        break;
      case "play": {
        const card = DECK[e.cardId];
        if (e.player === me) {
          const i = myHand.indexOf(e.cardId);
          if (i >= 0) myHand.splice(i, 1);
        } else {
          const model = models[e.player];
          const preferred = e.fromDraw && lastTurnDraw?.player === e.player ? lastTurnDraw.segment : null;
          removeCard(model, e.cardId, preferred);
          if (card.colorIndex === WILD_COLOR_INDEX) model.hintColor = e.color;
          else model.hintColor = null;
        }
        top = e.cardId;
        activeColor = e.color;
        lastTurnDraw = null;
        break;
      }
      case "draw": {
        if (e.player === me) {
          myHand.push(...(e.cards ?? []));
          break;
        }
        const model = models[e.player];
        if (e.reason === "turn") {
          // Drawing on your own turn usually means nothing was playable.
          const mask = unplayableMask(activeColor, top);
          applyMask(model, mask);
          if (view.rules.drawUntilPlayable && e.count > 1) {
            model.segments.push({ count: e.count - 1, ...mask });
          }
          if (e.count > 0) {
            const seg: Segment = { count: view.rules.drawUntilPlayable ? 1 : e.count, colorMask: 0, rankMask: 0 };
            model.segments.push(seg);
            lastTurnDraw = { player: e.player, segment: seg };
          }
        } else {
          if (e.reason === "stack" && top !== null) {
            // Took the stacked penalty instead of stacking: probably had no +4 (or +2 on a +2).
            const rankMask = DECK[top].rank === "draw2" ? DRAW2_BIT | WILD4_BIT : WILD4_BIT;
            applyMask(model, { colorMask: 0, rankMask });
          }
          if (e.count > 0) model.segments.push({ count: e.count, colorMask: 0, rankMask: 0 });
        }
        break;
      }
      case "endTurn":
        if (e.player !== me && lastTurnDraw?.player === e.player) {
          // Drew and did not play it: the new card most likely was not playable either.
          const mask = unplayableMask(activeColor, top);
          lastTurnDraw.segment.colorMask |= mask.colorMask;
          lastTurnDraw.segment.rankMask |= mask.rankMask;
        }
        lastTurnDraw = null;
        break;
      case "pass":
        if (e.player !== me) applyMask(models[e.player], unplayableMask(activeColor, top));
        break;
      case "challenge":
        if (e.offender !== me) {
          const model = models[e.offender];
          if (e.guilty) model.hintColor = e.color;
          else applyMask(model, { colorMask: colorBit(e.color), rankMask: 0 });
        }
        break;
      case "reveal":
        if (e.to === me) models[e.player] = { known: [...e.cards], segments: [], hintColor: null };
        break;
      case "swap": {
        if (e.player === me || e.target === me) {
          const other = e.player === me ? e.target : e.player;
          models[other] = { known: [...myHand], segments: [], hintColor: null };
          myHand = [...(e.hands[me] ?? [])];
          models[me] = emptyModel();
        } else {
          const a = models[e.player];
          models[e.player] = models[e.target];
          models[e.target] = a;
        }
        break;
      }
      case "rotate": {
        const old = models.map(cloneModel);
        const next = (i: number) => (((i + e.direction) % n) + n) % n;
        for (let i = 0; i < n; i++) models[next(i)] = old[i];
        models[next(me)] = { known: [...myHand], segments: [], hintColor: null };
        models[me] = emptyModel();
        myHand = [...(e.hands[me] ?? [])];
        break;
      }
      default:
        break;
    }
  }

  // Reconcile with the public hand sizes (guards against any drift).
  for (let p = 0; p < n; p++) {
    if (p === me) continue;
    const model = models[p];
    let total = model.known.length + model.segments.reduce((a, s) => a + s.count, 0);
    const size = view.handSizes[p];
    while (total > size) {
      const seg = model.segments.reduce<Segment | null>((b, s) => (s.count > 0 && (!b || s.count > b.count) ? s : b), null);
      if (seg) seg.count--;
      else model.known.pop();
      total--;
    }
    if (total < size) model.segments.push({ count: size - total, colorMask: 0, rankMask: 0 });
    model.segments = model.segments.filter((s) => s.count > 0);
  }

  const excluded = new Uint8Array(ALL_CARD_IDS.length);
  for (const id of view.hand) excluded[id] = 1;
  for (const id of view.discardPile) excluded[id] = 1;
  for (let p = 0; p < n; p++) if (p !== me) for (const id of models[p].known) excluded[id] = 1;
  const unknownPool = ALL_CARD_IDS.filter((id) => !excluded[id]);

  return { me, models, unknownPool };
}
