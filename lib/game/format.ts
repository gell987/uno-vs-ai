import {
  COLOR_LABEL,
  DECK,
  cardName,
  isPlayable,
  type Action,
  type CardId,
  type Color,
  type LogEntry,
  type MatchState,
  type PlayerIndex,
} from "@/lib/uno";

export const HUMAN: PlayerIndex = 0;

export function nameOf(match: MatchState, p: PlayerIndex): string {
  return p === HUMAN ? "You" : match.config.players[p]?.name ?? `Player ${p + 1}`;
}

/** "You are" / "Nova is" */
function be(match: MatchState, p: PlayerIndex): string {
  return p === HUMAN ? "You are" : `${nameOf(match, p)} is`;
}

function possessive(match: MatchState, p: PlayerIndex): string {
  return p === HUMAN ? "your" : `${nameOf(match, p)}'s`;
}

export function describeAction(action: Action, match: MatchState): string {
  switch (action.type) {
    case "play": {
      const card = DECK[action.cardId];
      let text = cardName(card);
      if (action.color) text += ` → ${COLOR_LABEL[action.color]}`;
      if (action.target !== undefined) text += ` (swap with ${nameOf(match, action.target)})`;
      return text;
    }
    case "draw":
      return match.round.pendingDraw > 0 ? `Take +${match.round.pendingDraw}` : "Draw a card";
    case "keep":
      return "Keep the drawn card";
    case "pass":
      return "Pass";
    case "chooseColor":
      return `Start on ${COLOR_LABEL[action.color]}`;
    case "challenge":
      return "Challenge";
    case "accept":
      return "Accept the +4";
    case "callUno":
      return "Call UNO";
    case "catchUno":
      return `Catch ${nameOf(match, action.target)}`;
  }
}

export type Tone = "neutral" | "good" | "bad" | "info" | "alert";

export interface LogLine {
  text: string;
  tone: Tone;
  cardId?: CardId;
  color?: Color;
}

/** Turns a log entry into a sentence from the human's point of view (null = not worth showing). */
export function describeEntry(e: LogEntry, match: MatchState): LogLine | null {
  const n = (p: PlayerIndex) => nameOf(match, p);
  switch (e.t) {
    case "deal":
      return { text: `${n(e.dealer)} dealt ${e.handSize} cards each.`, tone: "info" };
    case "start":
      return { text: `The starting card is ${cardName(DECK[e.cardId])}.`, tone: "info", cardId: e.cardId };
    case "color":
      return { text: `${n(e.player)} chose ${COLOR_LABEL[e.color]} to start.`, tone: "neutral", color: e.color };
    case "play": {
      const card = DECK[e.cardId];
      let text = `${n(e.player)} played ${cardName(card)}`;
      if (card.color === "wild") text += ` and chose ${COLOR_LABEL[e.color]}`;
      if (e.fromDraw) text += " (just drawn)";
      return { text: `${text}.`, tone: "neutral", cardId: e.cardId, color: card.color === "wild" ? e.color : undefined };
    }
    case "draw": {
      if (e.count === 0) return { text: `${n(e.player)} had nothing left to draw.`, tone: "info" };
      const cards = e.count === 1 ? "a card" : `${e.count} cards`;
      const bad = e.player === HUMAN ? "bad" : "good";
      switch (e.reason) {
        case "turn":
          return { text: `${n(e.player)} drew ${cards}.`, tone: "neutral" };
        case "stack":
          return { text: `${n(e.player)} took the stacked +${e.count}.`, tone: bad };
        case "uno":
          return { text: `${n(e.player)} drew ${cards} for missing UNO.`, tone: bad };
        case "challenge":
          return { text: `${n(e.player)} drew ${cards} after the challenge.`, tone: bad };
        case "start":
          return { text: `${n(e.player)} drew ${cards} from the starting Draw Two.`, tone: bad };
        default:
          return { text: `${n(e.player)} drew ${cards}.`, tone: bad };
      }
    }
    case "endTurn":
      return null;
    case "pass":
      return { text: `${n(e.player)} couldn't play or draw, and passed.`, tone: "info" };
    case "skip":
      return { text: `${be(match, e.player)} skipped.`, tone: e.player === HUMAN ? "bad" : "info" };
    case "reverse":
      return { text: "Play direction reversed.", tone: "info" };
    case "challenge":
      return {
        text: `${n(e.player)} challenged ${possessive(match, e.offender)} Wild Draw Four: ${
          e.guilty ? `bluff! ${n(e.offender)} had ${COLOR_LABEL[e.color]}.` : `no bluff, ${n(e.offender)} had no ${COLOR_LABEL[e.color]}.`
        }`,
        tone: "alert",
      };
    case "reveal":
      return e.to === HUMAN
        ? { text: `You saw ${possessive(match, e.player)} hand: ${e.cards.map((id) => cardName(DECK[id])).join(", ") || "empty"}.`, tone: "info" }
        : null;
    case "uno":
      return { text: `${n(e.player)} called UNO!`, tone: "alert" };
    case "caught":
      return { text: `${n(e.player)} caught ${n(e.target)} without calling UNO!`, tone: e.target === HUMAN ? "bad" : "good" };
    case "swap":
      return { text: `${n(e.player)} swapped hands with ${n(e.target)}.`, tone: "alert" };
    case "rotate":
      return { text: "Everyone passed their hand along.", tone: "alert" };
    case "reshuffle":
      return { text: `The discard pile was shuffled into a new deck (${e.count} cards).`, tone: "info" };
    case "roundOver":
      if (e.winner === null) return { text: "Stalemate: nobody could move, and the round is a tie.", tone: "info" };
      return {
        text: e.reason === "stalemate"
          ? `Stalemate: ${n(e.winner)} had the fewest points and scored ${e.points}.`
          : `${n(e.winner)} won the round, +${e.points} points!`,
        tone: e.winner === HUMAN ? "good" : "bad",
      };
  }
}

export interface Status {
  text: string;
  tone: Tone;
}

/** The one-line prompt shown in the middle of the table. */
export function statusFor(match: MatchState, thinking: PlayerIndex | null): Status {
  const r = match.round;
  const phase = r.phase;
  if (phase.type === "roundOver") return { text: "Round over", tone: "info" };
  const me = HUMAN;
  if (r.current !== me) {
    const who = nameOf(match, r.current);
    if (phase.type === "challenge") return { text: `${who} is deciding whether to challenge…`, tone: "neutral" };
    if (phase.type === "chooseStartColor") return { text: `${who} is choosing the starting color…`, tone: "neutral" };
    return { text: thinking === r.current ? `${who} is thinking…` : `${who}'s turn`, tone: "neutral" };
  }
  switch (phase.type) {
    case "chooseStartColor":
      return { text: "The first card is a Wild: choose the starting color.", tone: "alert" };
    case "challenge":
      return { text: `${nameOf(match, phase.offender)} hit you with a Wild Draw Four. Challenge it?`, tone: "alert" };
    case "drawnPlayable":
      return { text: "You drew a playable card. Play it or keep it.", tone: "alert" };
    default:
      break;
  }
  if (r.pendingDraw > 0) return { text: `Stack a draw card or take +${r.pendingDraw}.`, tone: "alert" };
  const playable = r.hands[me].some((id) => isPlayable(r, id));
  const canDraw = r.drawPile.length > 0 || r.discardPile.length > 1;
  if (!playable && !canDraw) return { text: "Nothing to play and no cards to draw. Pass.", tone: "info" };
  if (!playable) return { text: "No playable cards. Draw one.", tone: "info" };
  const top = DECK[r.discardPile[r.discardPile.length - 1]];
  const color = r.activeColor ? COLOR_LABEL[r.activeColor] : "";
  const rank = top.color === "wild" ? "" : ` or ${top.rank.length === 1 ? `${top.rank === "8" ? "an" : "a"} ${top.rank}` : cardName(top).replace(/^\w+ /, "a ")}`;
  return { text: `Your turn: play ${color}${rank}, or a wild.`, tone: "good" };
}
