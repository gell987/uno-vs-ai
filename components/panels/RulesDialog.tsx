"use client";

import { Kbd, Modal } from "@/components/ui/primitives";
import { PERSONAS } from "@/lib/ai";
import { DIFFICULTIES } from "@/lib/uno";

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display mb-1.5 mt-5 text-xl text-amber-200 first:mt-0">{children}</h3>;
}

export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How to play" wide labelledBy="rules-title">
      <div className="space-y-2 text-[15px] leading-relaxed text-white/85">
        <H>The goal</H>
        <p>Be the first to get rid of all your cards. When you go out, you score points for every card left in your opponents&apos; hands. The first player to reach the target score wins the match.</p>

        <H>Your turn</H>
        <p>
          Play one card that matches the top of the discard pile by <strong>color</strong> or by <strong>number/symbol</strong>, or play a
          <strong> Wild</strong>. If you can&apos;t (or don&apos;t want to), draw a card; if it&apos;s playable you may play it right away.
        </p>

        <H>Action cards</H>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Skip</strong>: the next player loses their turn.</li>
          <li><strong>Reverse</strong>: play changes direction. With two players it works like a Skip.</li>
          <li><strong>Draw Two</strong>: the next player draws 2 and loses their turn.</li>
          <li><strong>Wild</strong>: choose the next color.</li>
          <li>
            <strong>Wild Draw Four</strong>: choose the color; the next player draws 4 and loses their turn. It&apos;s only allowed when you
            hold no card of the current color, and the next player may <strong>challenge</strong> it. A caught bluffer draws 4 instead; a
            wrong challenge costs the challenger 6.
          </li>
        </ul>

        <H>UNO!</H>
        <p>
          When you play your second-to-last card, press <strong>UNO!</strong> (you can press it before or right after playing). If an
          opponent catches you before the next player moves, you draw 2. Opponents forget too: when one does, a <strong>Catch!</strong> button
          appears next to them.
        </p>

        <H>Scoring</H>
        <p>Number cards are worth their number, Skip/Reverse/Draw Two 20 points, and wilds 50 points.</p>

        <H>House rules (optional)</H>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Stacking</strong>: answer a +2 with a +2 or +4 (or a +4 with a +4) to pass the growing penalty on.</li>
          <li><strong>Draw until playable</strong>: keep drawing until you get a card you can play.</li>
          <li><strong>Seven-O</strong>: playing a 7 swaps hands with a player you choose; a 0 passes every hand along.</li>
        </ul>

        <H>Your opponents</H>
        <ul className="space-y-1.5">
          {DIFFICULTIES.map((d) => (
            <li key={d}>
              <strong>{PERSONAS[d].title}</strong>: {PERSONAS[d].description}
            </li>
          ))}
        </ul>
        <p className="text-sm text-white/60">
          No AI ever sees your cards or the order of the deck. Everything they know comes from the table: what you played, what you drew,
          and what you chose.
        </p>

        <H>Keyboard</H>
        <p className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          <span><Kbd>←</Kbd> <Kbd>→</Kbd> browse cards</span>
          <span><Kbd>Enter</Kbd> play card</span>
          <span><Kbd>D</Kbd> draw / pass</span>
          <span><Kbd>K</Kbd> keep drawn card</span>
          <span><Kbd>P</Kbd> play drawn card</span>
          <span><Kbd>U</Kbd> UNO!</span>
          <span><Kbd>C</Kbd> catch</span>
          <span><Kbd>H</Kbd> hint</span>
          <span><Kbd>1</Kbd>–<Kbd>4</Kbd> pick a color</span>
          <span><Kbd>Esc</Kbd> menu</span>
        </p>
        <p className="pt-3 text-xs text-white/45">Unofficial fan project. UNO is a trademark of Mattel; this game is not affiliated with or endorsed by Mattel.</p>
      </div>
    </Modal>
  );
}
