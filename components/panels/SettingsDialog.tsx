"use client";

import { useState } from "react";
import { Button, Modal, Segmented, Toggle } from "@/components/ui/primitives";
import { FELTS, type Felt, type Settings, type Speed } from "@/lib/game/settings";

const FELT_SWATCH: Record<Felt, string> = {
  emerald: "#1f7a4a",
  ocean: "#1f5f8e",
  violet: "#5b3b91",
  crimson: "#8e2b2b",
  graphite: "#3b4049",
};

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/[0.04] px-4 py-2">
      <h3 className="pb-1 pt-2 text-[12px] font-bold uppercase tracking-wider text-white/50">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsDialog({
  open,
  onClose,
  settings,
  onChange,
  onResetStats,
  onResetProfile,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
  onResetStats: () => void;
  onResetProfile: () => void;
}) {
  const [confirm, setConfirm] = useState<null | "stats" | "profile">(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <Modal open={open} onClose={onClose} title="Settings" labelledBy="settings-title">
      <div className="space-y-3">
        <Group title="Sound">
          <Toggle label="Sound effects" checked={settings.sound} onChange={(v) => set("sound", v)} />
          <label className={`flex items-center gap-3 py-2 ${settings.sound ? "" : "opacity-45"}`}>
            <span className="w-16 text-[15px] font-medium">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              disabled={!settings.sound}
              onChange={(e) => set("volume", Number(e.target.value))}
              className="flex-1 accent-amber-300"
              aria-label="Volume"
            />
            <span className="w-10 text-right text-sm tabular-nums text-white/70">{Math.round(settings.volume * 100)}%</span>
          </label>
          <Toggle label="Spoken “UNO!” callouts" checked={settings.voice} disabled={!settings.sound} onChange={(v) => set("voice", v)} />
          <Toggle label="Vibration" description="On phones that support it." checked={settings.haptics} onChange={(v) => set("haptics", v)} />
        </Group>

        <Group title="Gameplay">
          <div className="py-2">
            <div className="mb-2 text-[15px] font-medium">Game speed</div>
            <Segmented<Speed>
              label="Game speed"
              value={settings.speed}
              onChange={(v) => set("speed", v)}
              options={[
                { value: "relaxed", label: "Relaxed" },
                { value: "normal", label: "Normal" },
                { value: "fast", label: "Fast" },
              ]}
            />
          </div>
          <Toggle label="Highlight playable cards" checked={settings.hints} onChange={(v) => set("hints", v)} />
          <Toggle
            label="Call UNO for me"
            description="Assist mode: never get caught forgetting."
            checked={settings.autoUno}
            onChange={(v) => set("autoUno", v)}
          />
          <Toggle label="AI table talk" description="Opponents react to the game in speech bubbles." checked={settings.chatter} onChange={(v) => set("chatter", v)} />
          <Toggle
            label="AI insights"
            description="Show how the AI evaluated its moves and what it believes about your hand."
            checked={settings.showInsights}
            onChange={(v) => set("showInsights", v)}
          />
        </Group>

        <Group title="Look">
          <Toggle
            label="Color-blind symbols"
            description="Adds a shape to each color: ▲ red, ● yellow, ■ green, ◆ blue."
            checked={settings.colorblind}
            onChange={(v) => set("colorblind", v)}
          />
          <div className="py-2">
            <div className="mb-2 text-[15px] font-medium">Table felt</div>
            <div className="flex gap-2" role="radiogroup" aria-label="Table felt">
              {FELTS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={settings.felt === f}
                  aria-label={f}
                  title={f}
                  onClick={() => set("felt", f)}
                  className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-[#0e1a14] transition ${settings.felt === f ? "ring-2 ring-amber-300" : "ring-1 ring-white/20 hover:ring-white/50"}`}
                  style={{ background: `radial-gradient(circle at 35% 35%, ${FELT_SWATCH[f]}, #0b1510)` }}
                />
              ))}
            </div>
          </div>
        </Group>

        <Group title="Data">
          <div className="flex flex-wrap gap-2 py-2">
            {confirm === null ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setConfirm("stats")}>
                  Reset stats
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirm("profile")}>
                  Make the AI forget me
                </Button>
              </>
            ) : (
              <>
                <span className="w-full text-sm text-white/75">
                  {confirm === "stats" ? "Erase all your stats?" : "Erase everything the AI has learned about your play?"}
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (confirm === "stats") onResetStats();
                    else onResetProfile();
                    setConfirm(null);
                  }}
                >
                  Yes, erase
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </Group>
      </div>
    </Modal>
  );
}
