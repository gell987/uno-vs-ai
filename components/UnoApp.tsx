"use client";

import { useCallback, useEffect, useState } from "react";
import { GameScreen } from "@/components/game/GameScreen";
import { Lobby } from "@/components/lobby/Lobby";
import { RulesDialog } from "@/components/panels/RulesDialog";
import { SettingsDialog } from "@/components/panels/SettingsDialog";
import { StatsDialog } from "@/components/panels/StatsDialog";
import { sound } from "@/lib/audio/sound";
import { AI_NAMES, DEFAULT_PROFILE } from "@/lib/ai";
import { GameController } from "@/lib/game/controller";
import { HUMAN } from "@/lib/game/format";
import { EMPTY_STATS, recordEntries } from "@/lib/game/stats";
import { matchStore, profileStore, settingsStore, setupStore, statsStore, useStore } from "@/lib/game/stores";
import type { PlayerConfig } from "@/lib/uno";

let singleton: GameController | null = null;

function getController(): GameController {
  if (!singleton) {
    singleton = new GameController({
      getSettings: settingsStore.get,
      getProfile: profileStore.get,
      setProfile: (p) => profileStore.set(p),
      onEntries: (entries, match) => statsStore.set((s) => recordEntries(s, entries, match, HUMAN)),
      onSave: (m) => matchStore.set(m && !m.over ? m : null),
    });
  }
  return singleton;
}

type DialogName = "settings" | "rules" | "stats";

export default function UnoApp() {
  const settings = useStore(settingsStore);
  const setup = useStore(setupStore);
  const stats = useStore(statsStore);
  const profile = useStore(profileStore);
  const saved = useStore(matchStore);
  const [controller] = useState(getController);
  const [screen, setScreen] = useState<"lobby" | "game">("lobby");
  const [dialog, setDialog] = useState<DialogName | null>(null);

  useEffect(() => {
    sound.bindUnlock();
  }, []);

  useEffect(() => {
    sound.setVolume(settings.volume);
    sound.setMuted(!settings.sound);
    sound.setVoice(settings.voice);
  }, [settings.volume, settings.sound, settings.voice]);

  useEffect(() => {
    controller.refresh();
  }, [controller, settings.speed, settings.showInsights]);

  useEffect(() => {
    if (dialog === null) return;
    controller.pause("dialog");
    return () => controller.resume("dialog");
  }, [controller, dialog]);

  const startMatch = useCallback(() => {
    const players: PlayerConfig[] = [
      { name: setup.playerName.trim() || "You", kind: "human", difficulty: "grandmaster" },
      ...setup.opponents.map((difficulty, i): PlayerConfig => ({ name: AI_NAMES[i], kind: "ai", difficulty })),
    ];
    controller.newMatch({ players, rules: setup.rules, targetScore: setup.targetScore });
    setScreen("game");
  }, [controller, setup]);

  const continueMatch = useCallback(() => {
    if (!saved) return;
    controller.load(saved);
    setScreen("game");
  }, [controller, saved]);

  const playAgain = useCallback(() => {
    const m = controller.getSnapshot().match;
    if (m) controller.newMatch(m.config);
    else startMatch();
  }, [controller, startMatch]);

  const toMenu = useCallback(() => {
    controller.quit();
    setScreen("lobby");
  }, [controller]);

  return (
    <>
      {screen === "lobby" ? (
        <Lobby
          setup={setup}
          onSetup={setupStore.set}
          onPlay={startMatch}
          saved={saved}
          onContinue={continueMatch}
          stats={stats}
          onOpenRules={() => setDialog("rules")}
          onOpenSettings={() => setDialog("settings")}
          onOpenStats={() => setDialog("stats")}
          felt={settings.felt}
        />
      ) : (
        <GameScreen
          controller={controller}
          settings={settings}
          profile={profile}
          onMenu={toMenu}
          onPlayAgain={playAgain}
          onOpenSettings={() => setDialog("settings")}
          onOpenRules={() => setDialog("rules")}
          onToggleSound={() => settingsStore.set((s) => ({ ...s, sound: !s.sound }))}
        />
      )}
      <SettingsDialog
        open={dialog === "settings"}
        onClose={() => setDialog(null)}
        settings={settings}
        onChange={settingsStore.set}
        onResetStats={() => statsStore.set(EMPTY_STATS)}
        onResetProfile={() => profileStore.set(DEFAULT_PROFILE)}
      />
      <RulesDialog open={dialog === "rules"} onClose={() => setDialog(null)} />
      <StatsDialog open={dialog === "stats"} onClose={() => setDialog(null)} stats={stats} />
    </>
  );
}
