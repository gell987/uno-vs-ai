import { DECK, type Difficulty, type LogEntry, type PlayerIndex } from "@/lib/uno";

type Mood =
  | "uno"
  | "caughtSomeone"
  | "gotCaught"
  | "wildFour"
  | "bluffCaught"
  | "challengeFailed"
  | "wasBluffing"
  | "wasHonest"
  | "roundWon"
  | "roundLost"
  | "swap";

const LINES: Record<Difficulty, Record<Mood, string[]>> = {
  rookie: {
    uno: ["UNO! Did I do that right?", "Uno! Yay!", "One card left!"],
    caughtSomeone: ["Hey, you didn't say UNO!", "I saw that! Draw two!"],
    gotCaught: ["Oops! I always forget that part.", "Aww, not again!"],
    wildFour: ["Plus four! Sorry!", "Is this mean? Plus four!"],
    bluffCaught: ["You were fibbing!", "Ha! I knew it! Kind of."],
    challengeFailed: ["Oh no, six cards?!", "I shouldn't have done that."],
    wasBluffing: ["Oh, that's not allowed?", "Oopsie."],
    wasHonest: ["Nope, I had nothing!", "Told you!"],
    roundWon: ["I won?! I won!", "Beginner's luck!"],
    roundLost: ["Good game!", "You're really good!"],
    swap: ["Let's trade!", "Ooh, new cards!"],
  },
  casual: {
    uno: ["UNO!", "One left!", "Almost there. UNO!"],
    caughtSomeone: ["Forgot something? UNO penalty!", "You didn't call UNO. Draw two."],
    gotCaught: ["Ugh, fine.", "Missed it. My bad."],
    wildFour: ["Draw four!", "Take four, friend."],
    bluffCaught: ["Caught you!", "Nice try."],
    challengeFailed: ["Worth a shot.", "Guess you were clean."],
    wasBluffing: ["Busted.", "Yeah, okay, fair."],
    wasHonest: ["Clean as a whistle.", "Draw six!"],
    roundWon: ["Nice, that's mine.", "GG!"],
    roundLost: ["Well played.", "Next round's mine."],
    swap: ["I'll take those.", "Swap time."],
  },
  shark: {
    uno: ["UNO.", "One card. Your move.", "UNO. Smell that?"],
    caughtSomeone: ["UNO penalty. I notice everything.", "Didn't call it. Two cards."],
    gotCaught: ["Sharp eyes.", "Hm. Noted."],
    wildFour: ["Draw four. Nothing personal.", "Four more for you."],
    bluffCaught: ["You were holding it. I could tell.", "Your draws gave you away."],
    challengeFailed: ["The odds were right. The cards weren't.", "Unlucky."],
    wasBluffing: ["Calculated risk.", "Worth it."],
    wasHonest: ["I don't bluff often. Draw six.", "Should have trusted me."],
    roundWon: ["Blood in the water.", "Just as planned."],
    roundLost: ["Well played. I'll adjust.", "You got lucky. Or good."],
    swap: ["Your hand looks better anyway.", "I'll be taking those."],
  },
  grandmaster: {
    uno: ["UNO.", "UNO. Win probability rising.", "One card. As projected."],
    caughtSomeone: ["UNO violation detected.", "Penalty applied: two cards."],
    gotCaught: ["An unlikely oversight.", "Recalibrating."],
    wildFour: ["Draw four. The simulations agreed.", "Plus four. Optimal line."],
    bluffCaught: ["Bluff detected.", "Your hand was predictable."],
    challengeFailed: ["Low-probability outcome.", "Acceptable variance."],
    wasBluffing: ["The expected value was positive.", "A calculated bluff."],
    wasHonest: ["I never bluff without cause.", "Six cards. Regrettable, for you."],
    roundWon: ["Round won. Updating models.", "As simulated."],
    roundLost: ["Well played. Adapting.", "Interesting. I will learn from that."],
    swap: ["Exchanging hands. Favorable.", "Swap accepted."],
  },
};

export interface ChatLine {
  player: PlayerIndex;
  text: string;
}

/**
 * Turns game events into short in-character remarks from AI players.
 * `isAi` tells which seats can talk; `rand` supplies randomness.
 */
export function chatterFor(
  entries: readonly LogEntry[],
  difficultyOf: (p: PlayerIndex) => Difficulty | null,
  rand: () => number,
): ChatLine[] {
  const out: ChatLine[] = [];
  const say = (player: PlayerIndex, mood: Mood, chance = 1) => {
    const d = difficultyOf(player);
    if (!d || rand() > chance) return;
    const lines = LINES[d][mood];
    out.push({ player, text: lines[Math.floor(rand() * lines.length)] });
  };
  for (const e of entries) {
    switch (e.t) {
      case "uno":
        say(e.player, "uno", 0.8);
        break;
      case "caught":
        say(e.player, "caughtSomeone");
        say(e.target, "gotCaught", 0.7);
        break;
      case "play":
        if (DECK[e.cardId].rank === "wild4") say(e.player, "wildFour", 0.55);
        if (e.target !== undefined) say(e.player, "swap", 0.6);
        break;
      case "challenge":
        say(e.player, e.guilty ? "bluffCaught" : "challengeFailed", 0.9);
        say(e.offender, e.guilty ? "wasBluffing" : "wasHonest", 0.7);
        break;
      case "roundOver":
        if (e.winner === null) break;
        if (difficultyOf(e.winner)) {
          say(e.winner, "roundWon", 0.9);
        } else {
          // The human won: one of the AIs is a good sport about it.
          for (let p = 0; p < 4; p++) {
            if (p !== e.winner && difficultyOf(p)) {
              say(p, "roundLost", 0.85);
              break;
            }
          }
        }
        break;
      default:
        break;
    }
  }
  // Only one remark per speaker per event batch.
  const seen = new Set<PlayerIndex>();
  return out.filter((l) => (seen.has(l.player) ? false : (seen.add(l.player), true)));
}
