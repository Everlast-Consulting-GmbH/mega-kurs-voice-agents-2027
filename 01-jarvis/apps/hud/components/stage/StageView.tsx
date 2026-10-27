"use client";
import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useHud } from "@/lib/events/store";
import type { HudState } from "@/lib/events/reducer";
import { activeNotice } from "@/lib/derived";
import { liveCall, stageItem, stageMode } from "@/lib/stage";
import { useNow } from "@/lib/hooks";
import { useUi } from "@/lib/ui";
import { captionBox, cuWindow, orbPose } from "./layout";
import { Orb } from "./Orb";
import { TopFrame } from "./TopFrame";
import { Speaker } from "./Speaker";
import { StagePanel } from "./StagePanel";
import { ComputerStage } from "./ComputerStage";
import { CallMoment } from "./CallMoment";
import { ExplainBar } from "./ExplainBar";
import { CallBar } from "./CallBar";
import { AgentsDesk } from "./AgentsDesk";
import { RunSummary } from "./RunSummary";
import { BriefingDesk } from "./BriefingDesk";
import { NoticeToast } from "./NoticeToast";
import { AppDock, stageLocked, stageSticky } from "./AppDock";
import { hasLiveWork } from "@/lib/avatar/observe";
import { SystemWatch } from "./SystemWatch";
import { DesktopWorkspace } from "./DesktopWorkspace";

/** Signature of what is on screen, so the view re-renders the moment it changes (and on the clock). */
function useLayoutKey(now: number, dismissed: ReadonlySet<string>) {
  return useHud((s) => {
    const item = stageItem(s, now, dismissed);
    const extra = item?.kind === "approval" ? item.approval.status : item?.kind === "cu" || item?.kind === "run" ? item.phase : "";
    return `${stageMode(s, now, dismissed)}|${item?.key ?? ""}|${extra}|${s.cu.frame ? `${s.cu.frame.width}x${s.cu.frame.height}` : ""}`;
  });
}

/**
 * Jarvis (sphere + line) is the speaker; beside him exactly one stage. The content changes,
 * the composition stays: A calm, B stage, C computer use, D call (mockup Bild 1-5).
 */
export function StageView() {
  const now = useNow(250);
  const watchOpen = useUi((s) => s.watchOpen);
  const [autoWatchDismissed, setAutoWatchDismissed] = useState(false);
  const observing = useHud((s) => hasLiveWork(s, now));
  const [autoWatch, setAutoWatch] = useState(false);
  const dismissed = useUi((s) => s.dismissed);
  const openWorkspace = useUi((s) => s.workspace);
  const hiddenStageKey = useUi((s) => s.hiddenStageKey);
  const explainOpen = useUi((s) => s.explain);
  const startIntro = useUi((s) => s.startIntro);
  useEffect(() => {
    startIntro();
  }, [startIntro]);
  useLayoutKey(now, dismissed);

  const s = useHud.getState();
  const rawItem = stageItem(s, now, dismissed);
  // Second line of defence: approval, agents at work and computer use always beat an open app,
  // and a state-driven (sticky) item is never hidden by closing one.
  const nativeMode = stageMode(s, now, dismissed);
  const workspace = nativeMode === "call" || stageLocked(rawItem) ? null : openWorkspace;
  const hidden = nativeMode !== "call" && !stageSticky(rawItem) && rawItem?.key === hiddenStageKey;
  const item = hidden ? null : rawItem;
  const mode = nativeMode === "call" ? "call" : workspace ? "agents" : hidden ? "calm" : nativeMode;
  useEffect(() => {
    // Brief lookups never jerk the camera; longer work has time to settle before returning.
    const timer = setTimeout(() => setAutoWatch(observing), observing ? 600 : 2000);
    return () => clearTimeout(timer);
  }, [observing]);
  useEffect(() => {
    if (!observing && !autoWatch) setAutoWatchDismissed(false);
  }, [observing, autoWatch]);
  const monitoring = mode === "calm" && (watchOpen || (autoWatch && !autoWatchDismissed));
  const toggleWatch = () => {
    useUi.setState({ watchOpen: !monitoring });
    setAutoWatchDismissed(monitoring && (observing || autoWatch));
  };
  const explain = explainOpen && mode !== "call";
  const win = cuWindow(s.cu.frame, explain);
  const pose = workspace ? { cx: 182, cy: 285, r: 104 } : orbPose(mode, explain, win.left);
  const call = liveCall(s, now);
  const blush = activeNotice(s, now, dismissed)?.severity === "urgent" && mode !== "call";
  const panel = mode === "stage" && item && item.kind !== "cu" && item.kind !== "run" && item.kind !== "briefing" ? item : null;

  return (
    <div data-testid="stage-view" data-mode={workspace ? "desktop" : mode} className="stage-type absolute inset-0">
      <Orb pose={pose} fullBody={monitoring} mood={{ blush, beat: call === "ringing" || call === "connected" || call === "dialing", warm: mode === "summary" }} />
      {mode === "calm" && <SystemWatch expanded={monitoring} onToggle={toggleWatch} />}
      <TopFrame mode={workspace ? "stage" : mode} />
      <StagePanel item={panel} explain={explain} />
      <AnimatePresence>{mode === "desk" && <BriefingDesk key="briefing" orb={pose} explain={explain} />}</AnimatePresence>
      <AnimatePresence>{!workspace && mode === "agents" && <AgentsDesk key={`agents-${s.run?.runId}`} orb={pose} back={orbPose("summary", explain, win.left)} />}</AnimatePresence>
      {mode !== "call" && <AnimatePresence mode="wait">{workspace && <DesktopWorkspace key={workspace.app} workspace={workspace} stageKey={stageSticky(rawItem) ? undefined : rawItem?.key} />}</AnimatePresence>}
      <AnimatePresence>{mode === "summary" && <RunSummary key={`summary-${s.run?.runId}`} explain={explain} />}</AnimatePresence>
      <AnimatePresence>{mode === "cu" && item?.kind === "cu" && <ComputerStage key={item.key} phase={item.phase} explain={explain} />}</AnimatePresence>
      <AnimatePresence>{mode === "call" && <CallMoment key="call" pose={pose} />}</AnimatePresence>
      <Speaker box={captionBox(mode, explain, win.left)} hidden={mode === "call" || mode === "summary"} narrating={!workspace && (mode === "cu" || mode === "agents")} calm={mode === "calm"} column={mode === "agents"} request={!workspace && mode === "agents" ? runRequest(s) : null} />
      {mode !== "call" && <NoticeToast />}
      <AnimatePresence>{explain && <ExplainBar key="explain" />}</AnimatePresence>
      <CallBar />
      {mode !== "call" && <AppDock />}
    </div>
  );
}

/** What Leo asked for that started the run: the last thing he said before the plan. */
function runRequest(s: HudState): string | null {
  const since = s.run?.plannedAt ?? s.run?.startedAt;
  if (since == null) return null;
  return [...s.turns].reverse().find((t) => t.role === "user" && t.startedAt <= since && t.text.trim())?.text.trim() ?? null;
}

/** Sky mood for the backdrop (outside the scaled canvas, so it also fills letterbox bars). */
export function useSkyMood(): "night" | "call" | "warm" {
  const now = useNow(500);
  const dismissed = useUi((s) => s.dismissed);
  return useHud((s) => {
    if (stageMode(s, now, dismissed) === "call") return "call";
    return activeNotice(s, now, dismissed)?.severity === "urgent" ? "warm" : "night";
  });
}
