"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { safeParseEvent } from "@jarvis/contracts";
import { applyLocalEvent, connectEvents, disconnectEvents, onHudEvent, playScenario, stopScenario, useHud } from "@/lib/events/store";
import { isTyping, useUi } from "@/lib/ui";
import { sfx, unlockAudio } from "@/lib/sound/sfx";
import { loadVoiceSession, voice, VOICE_PROVIDER } from "@/lib/voice";
import type { ElevenLabsVoiceSession } from "@/lib/voice/ElevenLabsVoiceSession";
import { Stage } from "./Stage";
import { Sky } from "./stage/Sky";
import { StageView, useSkyMood } from "./stage/StageView";
import { DevPanel, simulateParallelTask } from "./DevPanel";
import { runRegie } from "@/lib/regie";
import { appDataOnEvent, loadAppData, useAppData } from "@/lib/apps/data";
import { listenForDesktopNavigation } from "@/lib/apps/navigation";

// The ElevenLabs SDK is only loaded when it is the active provider.
const ElevenLabsBridge = dynamic(() => import("./ElevenLabsBridge"), { ssr: false });

export default function HudApp() {
  useEffect(() => {
    connectEvents();
    void loadVoiceSession();
    return () => disconnectEvents();
  }, []);
  useKeyboard();
  useSounds();
  useAppDataSync();
  useDesktopEvents();
  useDevHook();
  const mood = useSkyMood();

  return (
    <Stage backdrop={<Sky mood={mood} />}>
      <StageView />
      <DevPanel />
      {VOICE_PROVIDER === "elevenlabs" && <ElevenLabsBridge session={voice() as ElevenLabsVoiceSession} />}
    </Stage>
  );
}

/** Tool focus opens the actual record, while an approval or new agent run takes the stage. */
function useDesktopEvents() {
  useEffect(() => listenForDesktopNavigation((context) => voice().updateContext(context)), []);
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      const ui = useUi.getState();
      if (e.key === "`" || e.key === "^" || e.code === "Backquote") ui.toggleDev();
      else if (e.key === "t" || e.key === "T") ui.toggleMuted();
      else if (e.key === "d" || e.key === "D") ui.toggleExplain();
      else if (!e.repeat && /^[rnmcRNMC]$/.test(e.key)) void runRegie(e.key);
    };
    const unlock = () => unlockAudio();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}

function useSounds() {
  useEffect(
    () =>
      onHudEvent((e) => {
        switch (e.type) {
          case "tool.started":
            return sfx.toolStart();
          case "tool.finished":
            return sfx.toolDone(e.payload.ok);
          case "task.created":
            return e.payload.kind === "computer_use" ? sfx.takeover() : sfx.click();
          case "task.done":
            return sfx.taskDone();
          case "task.failed":
            return sfx.taskFailed();
          case "approval.requested":
            return sfx.approval();
          case "approval.resolved":
            return sfx.approved(e.payload.approved);
          case "call.state":
            return sfx.ring(e.payload.status === "ringing");
          case "briefing.item":
            return sfx.briefing();
          case "tool.learned":
            return sfx.learned();
          case "notice":
            return sfx.alert(e.payload.severity === "urgent");
          case "cu.action":
            return e.payload.action === "click" ? sfx.click() : undefined;
          case "run.planned":
            return e.payload.approvalId ? sfx.approval() : undefined;
          case "agent.spawned":
            return sfx.click();
          case "agent.action":
            return e.payload.action === "send" || e.payload.action === "create" || e.payload.action === "move" ? sfx.toolDone(true) : undefined;
          case "run.summary":
            return sfx.taskDone();
        }
      }),
    [],
  );
}

/** App windows show live mock-world data (loaded once, then kept in step with the events). */
function useAppDataSync() {
  useEffect(() => {
    void loadAppData();
    return onHudEvent(appDataOnEvent);
  }, []);
}

/** window.__hud for rehearsals and the evidence script: inject validated events locally. */
function useDevHook() {
  useEffect(() => {
    (window as unknown as { __hud: unknown }).__hud = {
      inject(raw: unknown) {
        const p = safeParseEvent(raw);
        if (!p.success) throw new Error(p.error.message);
        applyLocalEvent(p.data);
      },
      state: () => useHud.getState(),
      reset: () => useHud.getState().reset(),
      play: (scenario: string) => playScenario(scenario),
      stop: () => stopScenario(),
      simulateParallelTask,
    };
  }, []);
}
