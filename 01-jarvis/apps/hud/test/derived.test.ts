import { describe, expect, it } from "vitest";
import { makeEvent, type JarvisEvent } from "@jarvis/contracts";
import { initialState, reduce, type HudState } from "@/lib/events/reducer";
import { activeApproval, activeNotice, callVisible, cuPhase, focusVisible, TIMING } from "@/lib/derived";

function at(events: Array<[number, JarvisEvent]>): HudState {
  return events.reduce((s, [t, e]) => reduce(s, e, t), initialState);
}

const created = makeEvent("task.created", { taskId: "k", title: "Termin", kind: "computer_use" });
const frame = makeEvent("cu.frame", { taskId: "k", imageUrl: "x", width: 1280, height: 800 });

describe("cuPhase", () => {
  it("is none without a frame", () => {
    expect(cuPhase(at([[0, created]]), 100)).toBe("none");
  });

  it("takes over while the computer-use task runs", () => {
    expect(cuPhase(at([[0, created], [10, frame]]), 30_000)).toBe("takeover");
  });

  it("shows done in takeover size, then shrinks to picture-in-picture, then hides", () => {
    const s = at([[0, created], [10, frame], [1000, makeEvent("task.done", { taskId: "k", result: "ok" })]]);
    expect(cuPhase(s, 1000 + TIMING.cuDoneHoldMs - 1)).toBe("done");
    expect(cuPhase(s, 1000 + TIMING.cuDoneHoldMs + 1)).toBe("pip");
    expect(cuPhase(s, 1000 + TIMING.cuPipHideMs + 1)).toBe("none");
  });

  it("releases the stage when a running task has been silent too long (lost task.done)", () => {
    const s = at([[0, created], [10, frame]]);
    expect(cuPhase(s, TIMING.staleMs - 1)).toBe("takeover");
    expect(cuPhase(s, TIMING.staleMs + 20)).toBe("pip");
  });

  it("treats failures like done (stamp, then pip)", () => {
    const s = at([[0, created], [10, frame], [500, makeEvent("task.failed", { taskId: "k", error: "Timeout" })]]);
    expect(cuPhase(s, 600)).toBe("done");
  });

  it("takes over for frames without a known task while they keep coming", () => {
    const s = at([[0, frame]]);
    expect(cuPhase(s, 5000)).toBe("takeover");
    expect(cuPhase(s, TIMING.cuOrphanMs + 1)).toBe("pip");
  });
});

describe("focusVisible", () => {
  it("shows the focus for its duration (default 6 s)", () => {
    const s = at([[0, makeEvent("ui.focus", { entity: "lead", entityId: "L-007", label: "Müller" })]]);
    expect(focusVisible(s, 5000)).toBe(true);
    expect(focusVisible(s, TIMING.focusDefaultMs + 1)).toBe(false);
    const t = at([[0, makeEvent("ui.focus", { entity: "lead", entityId: "L-007", label: "Müller", durationMs: 1000 })]]);
    expect(focusVisible(t, 1001)).toBe(false);
  });
});

describe("callVisible", () => {
  it("stays visible a few seconds after the call ended", () => {
    const s = at([[0, makeEvent("call.state", { callId: "p", status: "ended", to: "Leo" })]]);
    expect(callVisible(s, 1000)).toBe(true);
    expect(callVisible(s, TIMING.callLingerMs + 1)).toBe(false);
    expect(callVisible(initialState, 0)).toBe(false);
  });
});

describe("activeApproval", () => {
  it("returns the pending approval, and a resolved one briefly", () => {
    const req = makeEvent("approval.requested", { approvalId: "a", title: "Mail", detail: "d", risk: "medium" });
    const res = makeEvent("approval.resolved", { approvalId: "a", approved: true, via: "click" });
    expect(activeApproval(at([[0, req]]), 10)?.approvalId).toBe("a");
    const s = at([[0, req], [100, res]]);
    expect(activeApproval(s, 100 + TIMING.approvalLingerMs - 1)?.status).toBe("approved");
    expect(activeApproval(s, 100 + TIMING.approvalLingerMs + 1)).toBeNull();
  });
});

describe("activeNotice", () => {
  const notice = (noticeId: string, severity: "info" | "urgent") => makeEvent("notice", { noticeId, severity, title: "t", detail: "d" });

  it("shows the newest notice for a while; urgent ones longer", () => {
    const s = at([[1000, notice("n1", "urgent")]]);
    expect(activeNotice(s, 1000 + TIMING.noticeUrgentMs - 1)?.noticeId).toBe("n1");
    expect(activeNotice(s, 1000 + TIMING.noticeUrgentMs + 1)).toBeNull();
    const i = at([[1000, notice("n2", "info")]]);
    expect(activeNotice(i, 1000 + TIMING.noticeInfoMs + 1)).toBeNull();
    expect(TIMING.noticeUrgentMs).toBeGreaterThan(TIMING.noticeInfoMs);
  });

  it("keeps an urgent alert up when a newer info notice arrives", () => {
    const s = at([[1000, notice("n1", "urgent")], [3000, notice("n2", "info")]]);
    expect(activeNotice(s, 4000)?.noticeId).toBe("n1");
    expect(activeNotice(s, 1000 + TIMING.noticeUrgentMs + 1)?.noticeId).toBeUndefined();
    expect(activeNotice(s, 4000, new Set(["n1"]))?.noticeId).toBe("n2");
  });

  it("hides dismissed notices", () => {
    const s = at([[1000, notice("n1", "urgent")]]);
    expect(activeNotice(s, 1100, new Set(["n1"]))).toBeNull();
  });
});
