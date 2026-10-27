import type { HudState } from "@/lib/events/reducer";

// Time-dependent view selectors. Pure functions of (state, now) so they are testable
// and every component agrees on when an overlay appears or leaves.

export const TIMING = {
  cuDoneHoldMs: 2600, // "Erledigt" stamp at takeover size
  cuPipHideMs: 45_000, // picture-in-picture lingers after the task
  cuOrphanMs: 15_000, // frames without a task count as live for this long
  focusDefaultMs: 6000,
  callLingerMs: 5000,
  approvalLingerMs: 2600, // an answered approval stays until its outcome can be read
  noticeUrgentMs: 15_000, // alert card for urgent notices
  noticeInfoMs: 7000,
  staleMs: 120_000, // a "running" task without any update this long has lost its end event
};

export type CuPhase = "none" | "takeover" | "done" | "pip";

export function cuPhase(s: HudState, now: number): CuPhase {
  const { taskId, frame } = s.cu;
  if (!taskId || !frame) return "none";
  const task = s.tasks[taskId];
  if (!task) {
    const age = now - frame.at;
    return age < TIMING.cuOrphanMs ? "takeover" : age < TIMING.cuPipHideMs ? "pip" : "none";
  }
  if (task.status === "running") {
    const silent = now - Math.max(task.updatedAt, frame.at);
    if (silent <= TIMING.staleMs) return "takeover";
    return silent < TIMING.staleMs + TIMING.cuPipHideMs ? "pip" : "none";
  }
  const since = now - (task.finishedAt ?? task.updatedAt);
  if (since < TIMING.cuDoneHoldMs) return "done";
  if (since < TIMING.cuPipHideMs) return "pip";
  return "none";
}

export function focusVisible(s: HudState, now: number): boolean {
  return !!s.focus && now - s.focus.at < (s.focus.durationMs ?? TIMING.focusDefaultMs);
}

export function callVisible(s: HudState, now: number): boolean {
  if (!s.call) return false;
  if (s.call.status !== "ended" && s.call.status !== "failed") return true;
  return now - (s.call.endedAt ?? s.call.since) < TIMING.callLingerMs;
}

export function activeApproval(s: HudState, now: number) {
  for (const id of s.approvalOrder) {
    const a = s.approvals[id]!;
    if (a.status === "pending") return a;
    if (a.resolvedAt && now - a.resolvedAt < TIMING.approvalLingerMs) return a;
  }
  return null;
}

/** Notice on screen: the newest live urgent one, else the newest live info one. */
export function activeNotice(s: HudState, now: number, dismissed: ReadonlySet<string> = new Set()) {
  const live = s.notices.filter((n) => !dismissed.has(n.noticeId) && now - n.at < (n.severity === "urgent" ? TIMING.noticeUrgentMs : TIMING.noticeInfoMs));
  return live.find((n) => n.severity === "urgent") ?? live[0] ?? null;
}
