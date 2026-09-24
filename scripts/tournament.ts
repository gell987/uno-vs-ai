/**
 * AI vs AI tournament: measures how the difficulty levels actually compare.
 *
 *   npm run tournament -- --rounds 200 --budget 80
 *   npm run tournament -- --players 4 --rounds 100
 *
 * Every pairing replays the same shuffled decks with the seats swapped, so
 * neither side benefits from luck of the deal or from moving first.
 */
import { DEFAULT_PROFILE, PERSONAS, decide } from "../lib/ai";
import {
  DIFFICULTIES,
  HOUSE_RULES,
  OFFICIAL_RULES,
  applyAction,
  createRng,
  createRound,
  getPlayerView,
  nextFloat,
  nextU32,
  type Difficulty,
  type Rules,
} from "../lib/uno";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const ROUNDS = arg("rounds", 120);
const BUDGET = arg("budget", 80);
const PLAYERS = arg("players", 2);
const RULES: Rules = process.argv.includes("--house") ? HOUSE_RULES : OFFICIAL_RULES;

function playRound(seats: Difficulty[], seed: number): number | null {
  let s = createRound({ numPlayers: seats.length, rules: RULES, dealer: seed % seats.length, seed });
  const rng = createRng(seed ^ 0x5eed);
  let guard = 0;
  while (s.phase.type !== "roundOver") {
    if (guard++ > 5000) throw new Error("round did not finish");
    const actor = s.current;
    const decision = decide({
      view: getPlayerView(s, actor),
      difficulty: seats[actor],
      seed: nextU32(rng),
      human: null,
      profile: DEFAULT_PROFILE,
      seats,
      budgetMs: BUDGET,
    });
    const res = applyAction(s, decision.action);
    if (!res) throw new Error(`illegal action ${JSON.stringify(decision.action)}`);
    s = res.state;

    // Model the UNO race: the forgetful player may recover, otherwise someone may catch them.
    const v = s.unoVulnerable;
    if (v !== null) {
      if (nextFloat(rng) < PERSONAS[seats[v]].lateCall * 0.5) {
        s = applyAction(s, { type: "callUno", player: v })!.state;
      } else {
        for (let k = 1; k < seats.length; k++) {
          const q = (v + k) % seats.length;
          if (nextFloat(rng) < PERSONAS[seats[q]].catchChance) {
            s = applyAction(s, { type: "catchUno", player: q, target: v })!.state;
            break;
          }
        }
      }
    }
  }
  return s.phase.type === "roundOver" ? s.phase.result.winner : null;
}

function interval(wins: number, n: number): string {
  const p = wins / n;
  const half = 1.96 * Math.sqrt((p * (1 - p)) / n);
  return `${(p * 100).toFixed(1)}% ± ${(half * 100).toFixed(1)}`;
}

function headsUp(a: Difficulty, b: Difficulty): void {
  let winsA = 0;
  let games = 0;
  const t0 = Date.now();
  for (let r = 0; r < ROUNDS; r++) {
    const seed = 10_000 + r;
    if (playRound([a, b], seed) === 0) winsA++;
    if (playRound([b, a], seed) === 1) winsA++;
    games += 2;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`${a.padEnd(12)} vs ${b.padEnd(12)} ${interval(winsA, games).padEnd(16)} (${games} rounds, ${secs}s)`);
}

function freeForAll(): void {
  const seats = DIFFICULTIES.slice(0, PLAYERS) as Difficulty[];
  const wins = new Map<Difficulty, number>(seats.map((d) => [d, 0]));
  let games = 0;
  for (let r = 0; r < ROUNDS; r++) {
    // Rotate seating so every level sits in every seat equally often.
    for (let shift = 0; shift < seats.length; shift++) {
      const order = seats.map((_, i) => seats[(i + shift) % seats.length]);
      const w = playRound(order, 50_000 + r);
      if (w !== null) wins.set(order[w], wins.get(order[w])! + 1);
      games++;
    }
  }
  console.log(`${PLAYERS}-player free-for-all, ${games} rounds (fair share ${(100 / PLAYERS).toFixed(0)}%):`);
  for (const d of seats) console.log(`  ${d.padEnd(12)} ${interval(wins.get(d)!, games)}`);
}

console.log(`Rules: ${RULES === HOUSE_RULES ? "house" : "official"} · search budget ${BUDGET}ms/move\n`);
if (PLAYERS > 2) {
  freeForAll();
} else {
  const pairs: [Difficulty, Difficulty][] = [
    ["casual", "rookie"],
    ["shark", "casual"],
    ["shark", "rookie"],
    ["grandmaster", "shark"],
    ["grandmaster", "casual"],
    ["grandmaster", "rookie"],
  ];
  for (const [a, b] of pairs) headsUp(a, b);
}
