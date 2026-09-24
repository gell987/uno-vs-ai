"use client";

import { useMemo, useState } from "react";
import { CARD_HEX } from "@/components/cards/PlayingCard";
import { Segmented } from "@/components/ui/primitives";
import { PERSONAS, bluffRate, challengeRate, unoMissRate, wildFollowStrength, type OpponentProfile } from "@/lib/ai";
import type { LastDecision } from "@/lib/game/controller";
import { HUMAN, describeAction, describeEntry, nameOf, type Tone } from "@/lib/game/format";
import { COLORS, COLOR_LABEL, type MatchState, type PlayerIndex } from "@/lib/uno";
import type { HandRead } from "@/lib/ai";

const TONE: Record<Tone, string> = {
  neutral: "text-white/85",
  good: "text-emerald-300",
  bad: "text-rose-300",
  info: "text-white/55",
  alert: "text-amber-200",
};

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(2, value * 100)}%`, background: color }} />
    </div>
  );
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="rounded-2xl bg-white/[0.04] p-3.5">
      <h3 className="text-[13px] font-bold uppercase tracking-wide text-white/60">{title}</h3>
      <div className="mt-2.5">{children}</div>
      {note && <p className="mt-2.5 text-xs leading-snug text-white/45">{note}</p>}
    </section>
  );
}

function DecisionView({ match, decision }: { match: MatchState; decision: LastDecision }) {
  const { analysis, player } = decision;
  const cfg = match.config.players[player];
  const persona = PERSONAS[cfg.difficulty];
  const chosen = describeAction(decision.action, match);
  if (analysis.guilt) {
    const { pHasColor, pGuilty } = analysis.guilt;
    return (
      <Section title={`${cfg.name}'s last decision`}>
        <p className="text-sm text-white/85">
          Facing a Wild Draw Four, {cfg.name} chose to <strong>{decision.action.type === "challenge" ? "challenge" : "accept"}</strong>.
        </p>
        <div className="mt-2 space-y-1.5 text-xs text-white/70">
          <div className="flex items-center gap-2">
            <span className="w-32 shrink-0">Chance you held it</span>
            <Bar value={pHasColor} color="#94a3b8" />
            <span className="w-9 text-right tabular-nums">{pct(pHasColor)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-32 shrink-0">Estimated bluff</span>
            <Bar value={pGuilty} color="#f59e0b" />
            <span className="w-9 text-right tabular-nums">{pct(pGuilty)}</span>
          </div>
        </div>
      </Section>
    );
  }
  if (analysis.kind === "search") {
    const sims = analysis.candidates.reduce((a, c) => a + c.visits, 0);
    return (
      <Section
        title={`${cfg.name}'s last move`}
        note={`${persona.title}: ${sims.toLocaleString()} simulated games in ${analysis.elapsedMs} ms, over hands you could be holding.`}
      >
        <p className="text-sm text-white/85">
          Played <strong>{chosen}</strong>
          {analysis.winProbability !== undefined && (
            <>
              {" "}
              with a <strong>{pct(analysis.winProbability)}</strong> estimated chance to win the round.
            </>
          )}
        </p>
        <ul className="mt-2.5 space-y-1.5">
          {analysis.candidates.slice(0, 5).map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className={`w-[118px] shrink-0 truncate ${i === 0 ? "font-semibold text-white" : "text-white/65"}`} title={describeAction(c.action, match)}>
                {describeAction(c.action, match)}
              </span>
              <Bar value={c.value} color={i === 0 ? "#fcd34d" : "#64748b"} />
              <span className="w-9 text-right tabular-nums text-white/70">{pct(c.value)}</span>
            </li>
          ))}
        </ul>
      </Section>
    );
  }
  return (
    <Section title={`${cfg.name}'s last move`} note={`${persona.title} plays by rules of thumb${cfg.difficulty === "shark" ? " plus card counting" : ""}.`}>
      <p className="text-sm text-white/85">
        Played <strong>{chosen}</strong>
        {analysis.candidates.length > 1 && <> over {analysis.candidates.slice(1, 3).map((c) => describeAction(c.action, match)).join(" and ")}</>}.
      </p>
    </Section>
  );
}

function HandReadView({ match, read }: { match: MatchState; read: HandRead | null }) {
  let observer: PlayerIndex | null = null;
  const order = { rookie: 0, casual: 1, shark: 2, grandmaster: 3 };
  match.config.players.forEach((p, i) => {
    if (p.kind === "ai" && (observer === null || order[p.difficulty] > order[match.config.players[observer].difficulty])) observer = i;
  });
  if (observer === null || !read) return null;
  const name = nameOf(match, observer);
  const lacks = COLORS.filter((_, i) => read.hasColor[i] < 0.3);
  return (
    <Section title={`What ${name} thinks you hold`} note={`${name} can't see your cards. This is inferred from what you drew, played and chose.`}>
      <div className="space-y-1.5">
        {COLORS.map((c, i) => (
          <div key={c} className="flex items-center gap-2 text-xs">
            <span className="w-14 shrink-0 text-white/70">{COLOR_LABEL[c]}</span>
            <Bar value={read.hasColor[i]} color={CARD_HEX[c]} />
            <span className="w-9 text-right tabular-nums text-white/70">{pct(read.hasColor[i])}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-xs">
          <span className="w-14 shrink-0 text-white/70">Wild</span>
          <Bar value={read.hasWild} color="linear-gradient(90deg,#e8352e,#f7c51e,#2daa55,#1c6fd1)" />
          <span className="w-9 text-right tabular-nums text-white/70">{pct(read.hasWild)}</span>
        </div>
      </div>
      {lacks.length > 0 && (
        <p className="mt-2 text-xs text-amber-200/90">
          Suspects you have no {lacks.map((c) => COLOR_LABEL[c]).join(" or ")}.
        </p>
      )}
    </Section>
  );
}

function ProfileView({ profile }: { profile: OpponentProfile }) {
  const rows: [string, string][] = [
    ["Challenges a +4", `${pct(challengeRate(profile))} (${profile.wd4Challenged}/${profile.wd4Faced})`],
    ["Bluffing when challenged", `${pct(bluffRate(profile))} (${profile.caughtBluffing}/${profile.challengedByAi})`],
    ["Plays the color you pick", `${pct(wildFollowStrength(profile))} (${profile.wildFollowHits}/${profile.wildFollowTotal})`],
    ["Forgets UNO", `${pct(unoMissRate(profile))} (${profile.unoMisses}/${profile.unoChances})`],
  ];
  return (
    <Section
      title="What the AIs learned about you"
      note="Estimates start from sensible defaults and sharpen as they watch you play. Only things a person at the table could notice are used."
    >
      <dl className="space-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-white/65">{k}</dt>
            <dd className="tabular-nums text-white/90">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function SidePanel({
  match,
  lastDecision,
  handRead,
  profile,
  showInsights,
}: {
  match: MatchState;
  lastDecision: LastDecision | null;
  handRead: HandRead | null;
  profile: OpponentProfile;
  showInsights: boolean;
}) {
  const [tab, setTab] = useState<"insights" | "log">(showInsights ? "insights" : "log");
  const lines = useMemo(() => {
    const out: { key: number; text: string; tone: Tone; color?: string }[] = [];
    (match.round.log ?? []).forEach((e, i) => {
      const line = describeEntry(e, match);
      if (line) out.push({ key: i, text: line.text, tone: line.tone, color: line.color ? CARD_HEX[line.color] : undefined });
    });
    return out.reverse().slice(0, 150);
  }, [match]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Segmented
        label="Panel"
        value={tab}
        onChange={setTab}
        options={[
          { value: "insights", label: "AI insights" },
          { value: "log", label: "Game log" },
        ]}
      />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === "insights" ? (
          <div className="space-y-3">
            {!showInsights && <p className="text-sm text-white/60">AI insights are turned off in Settings.</p>}
            {showInsights && lastDecision && lastDecision.player !== HUMAN && <DecisionView match={match} decision={lastDecision} />}
            {showInsights && <HandReadView match={match} read={handRead} />}
            {showInsights && <ProfileView profile={profile} />}
            {showInsights && !lastDecision && !handRead && (
              <p className="text-sm text-white/60">Play a few cards and the AIs&apos; reasoning will show up here.</p>
            )}
          </div>
        ) : (
          <ol className="space-y-1.5" aria-label="Game log">
            {lines.map((l) => (
              <li key={l.key} className={`flex gap-2 text-[13px] leading-snug ${TONE[l.tone]}`}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: l.color ?? "rgb(255 255 255 / 0.25)" }} />
                <span>{l.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
