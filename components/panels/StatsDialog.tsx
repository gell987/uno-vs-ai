"use client";

import { Modal } from "@/components/ui/primitives";
import { PERSONAS } from "@/lib/ai";
import type { Stats } from "@/lib/game/stats";
import { DIFFICULTIES } from "@/lib/uno";

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.05] p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/50">{label}</div>
      <div className="font-display mt-1 text-2xl tabular-nums">{value}</div>
      {sub && <div className="text-xs text-white/55">{sub}</div>}
    </div>
  );
}

const pct = (won: number, played: number) => (played > 0 ? `${Math.round((won / played) * 100)}%` : "–");

export function StatsDialog({ open, onClose, stats }: { open: boolean; onClose: () => void; stats: Stats }) {
  return (
    <Modal open={open} onClose={onClose} title="Your stats" wide labelledBy="stats-title">
      {stats.roundsPlayed === 0 ? (
        <p className="text-white/70">No rounds played yet. Deal yourself in!</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Rounds won" value={pct(stats.roundsWon, stats.roundsPlayed)} sub={`${stats.roundsWon} of ${stats.roundsPlayed}`} />
            <Tile label="Matches won" value={pct(stats.matchesWon, stats.matchesPlayed)} sub={`${stats.matchesWon} of ${stats.matchesPlayed}`} />
            <Tile label="Win streak" value={stats.streak} sub={`best ${stats.bestStreak}`} />
            <Tile label="Points" value={stats.pointsScored.toLocaleString()} sub={`best round ${stats.bestRound}`} />
            <Tile label="UNO calls" value={stats.unoCalls} sub={`caught ${stats.timesCaught}×`} />
            <Tile label="Catches" value={stats.catches} sub="AIs you caught" />
            <Tile label="Challenges" value={`${stats.challengesWon}/${stats.challengesWon + stats.challengesLost}`} sub="bluffs you caught" />
            <Tile label="+4s played" value={stats.wildFoursPlayed} />
          </div>
          <div className="overflow-hidden rounded-2xl bg-white/[0.04]">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th className="px-4 py-2 font-semibold">Toughest opponent</th>
                  <th className="px-4 py-2 text-right font-semibold">Rounds</th>
                  <th className="px-4 py-2 text-right font-semibold">Won</th>
                  <th className="px-4 py-2 text-right font-semibold">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {DIFFICULTIES.map((d) => {
                  const r = stats.byDifficulty[d];
                  return (
                    <tr key={d} className="border-t border-white/5">
                      <td className="px-4 py-2 font-medium">{PERSONAS[d].title}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-white/75">{r.played}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-white/75">{r.won}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{pct(r.won, r.played)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
