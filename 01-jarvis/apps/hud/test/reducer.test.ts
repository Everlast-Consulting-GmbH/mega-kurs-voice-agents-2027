import { describe, expect, it } from "vitest";
import { makeEvent, type JarvisEventType, type PayloadOf } from "@jarvis/contracts";
import { initialState, reduce, type HudState } from "@/lib/events/reducer";

const ev = <T extends JarvisEventType>(type: T, payload: PayloadOf<T>) => makeEvent(type, payload);

function run(events: ReturnType<typeof ev>[], start = initialState, t0 = 1000): HudState {
  return events.reduce((s, e, i) => reduce(s, e, t0 + i * 100), start);
}

describe("reduce", () => {
  it("counts events and stamps receive time", () => {
    const s = run([ev("voice.state", { state: "listening" })]);
    expect(s.eventCount).toBe(1);
    expect(s.lastEventAt).toBe(1000);
  });

  it("tracks voice state with the time it changed", () => {
    const s = run([ev("voice.state", { state: "thinking" }), ev("voice.state", { state: "speaking" })]);
    expect(s.voice).toEqual({ state: "speaking", since: 1100 });
  });

  it("assembles transcript deltas into a turn and finalises it", () => {
    const s = run([
      ev("transcript.delta", { turnId: "t1", role: "assistant", text: "Guten" }),
      ev("transcript.delta", { turnId: "t1", role: "assistant", text: " Morgen." }),
    ]);
    expect(s.turns).toHaveLength(1);
    expect(s.turns[0]).toMatchObject({ turnId: "t1", role: "assistant", text: "Guten Morgen.", final: false, startedAt: 1000 });

    const f = reduce(
      s,
      ev("transcript.final", {
        turnId: "t1",
        role: "assistant",
        text: "Guten Morgen.",
        words: [
          { word: "Guten", startMs: 0, endMs: 300 },
          { word: "Morgen.", startMs: 300, endMs: 600 },
        ],
      }),
      2000,
    );
    expect(f.turns[0]).toMatchObject({ final: true, finalAt: 2000, text: "Guten Morgen." });
    expect(f.turns[0]!.words).toHaveLength(2);
  });

  it("creates a turn from a final without deltas and caps history", () => {
    let s = initialState;
    for (let i = 0; i < 40; i++) s = reduce(s, ev("transcript.final", { turnId: `t${i}`, role: "user", text: `Satz ${i}` }), i);
    expect(s.turns.length).toBeLessThanOrEqual(20);
    expect(s.turns.at(-1)!.text).toBe("Satz 39");
  });

  it("starts a fresh turn when deltas arrive for an already final turn id (looped scenarios)", () => {
    const s = run([
      ev("transcript.final", { turnId: "t1", role: "assistant", text: "Erster Durchlauf." }),
      ev("transcript.final", { turnId: "t2", role: "user", text: "Dazwischen" }),
      ev("transcript.delta", { turnId: "t1", role: "assistant", text: "Zweiter" }),
    ]);
    expect(s.turns.map((t) => t.turnId)).toEqual(["t2", "t1"]);
    expect(s.turns.at(-1)).toMatchObject({ text: "Zweiter", final: false, startedAt: 1200 });
  });

  it("tracks tool calls from start to finish and logs them", () => {
    const s = run([
      ev("tool.started", { callId: "c1", tool: "list_leads", args: { limit: 10 } }),
      ev("tool.finished", { callId: "c1", tool: "list_leads", ok: true, summary: "10 Leads geladen", durationMs: 110 }),
    ]);
    expect(s.tools.c1).toMatchObject({ tool: "list_leads", status: "ok", summary: "10 Leads geladen", durationMs: 110, startedAt: 1000, finishedAt: 1100 });
    expect(s.log[0]).toMatchObject({ kind: "tool", text: "10 Leads geladen", tone: "ok" });
  });

  it("marks failed tool calls as error, even without a matching start", () => {
    const s = run([ev("tool.finished", { callId: "x", tool: "send_email", ok: false, summary: "Fehler", durationMs: 5 })]);
    expect(s.tools.x).toMatchObject({ status: "error" });
    expect(s.log[0]!.tone).toBe("error");
  });

  it("follows a delegated task through progress to done", () => {
    const s = run([
      ev("task.created", { taskId: "k1", title: "Recherche", kind: "research" }),
      ev("task.progress", { taskId: "k1", message: "Lese Leads", step: 1, totalSteps: 3 }),
      ev("task.done", { taskId: "k1", result: "Fertig" }),
    ]);
    expect(s.tasks.k1).toMatchObject({ status: "done", message: "Lese Leads", step: 1, totalSteps: 3, result: "Fertig", finishedAt: 1200 });
    expect(s.taskOrder).toEqual(["k1"]);
  });

  it("records task failures", () => {
    const s = run([
      ev("task.created", { taskId: "k2", title: "CU", kind: "computer_use" }),
      ev("task.failed", { taskId: "k2", error: "Zeitüberschreitung" }),
    ]);
    expect(s.tasks.k2).toMatchObject({ status: "failed", error: "Zeitüberschreitung" });
    expect(s.log[0]!.tone).toBe("error");
  });

  it("keeps the computer-use screen, mode and actions per task", () => {
    const s = run([
      ev("task.created", { taskId: "k-cu", title: "Termin", kind: "computer_use" }),
      ev("cu.mode", { taskId: "k-cu", mode: "pixel", vncUrl: "http://vnc" }),
      ev("cu.frame", { taskId: "k-cu", imageUrl: "http://f/0.svg", width: 1280, height: 800 }),
      ev("cu.action", { taskId: "k-cu", action: "click", x: 10, y: 20, caption: "Klicke", step: 1, totalSteps: 8 }),
    ]);
    expect(s.cu.taskId).toBe("k-cu");
    expect(s.cu.mode).toBe("pixel");
    expect(s.cu.frame).toMatchObject({ url: "http://f/0.svg", width: 1280, height: 800 });
    expect(s.cu.actions).toHaveLength(1);
    expect(s.cu.actions[0]).toMatchObject({ caption: "Klicke", step: 1, receivedAt: 1300 });
    expect(s.tasks["k-cu"]).toMatchObject({ step: 1, totalSteps: 8, message: "Klicke" });

    // A new computer-use task starts with a clean action trail.
    const t = reduce(s, ev("cu.frame", { taskId: "k-2", imageUrl: "x", width: 1, height: 1 }), 5000);
    expect(t.cu.taskId).toBe("k-2");
    expect(t.cu.actions).toHaveLength(0);
  });

  it("tracks call status, connect time and the turns spoken during the call", () => {
    const s = run([
      ev("call.state", { callId: "p1", status: "dialing", to: "Leo" }),
      ev("call.state", { callId: "p1", status: "connected", to: "Leo", durationMs: 0 }),
      ev("transcript.final", { turnId: "t10", role: "assistant", text: "Hallo" }),
      ev("call.state", { callId: "p1", status: "ended", to: "Leo", durationMs: 6000 }),
      ev("transcript.final", { turnId: "t11", role: "user", text: "Nach dem Anruf" }),
    ]);
    expect(s.call).toMatchObject({ callId: "p1", status: "ended", connectedAt: 1100, durationMs: 6000, turnIds: ["t10"] });
  });

  it("attaches a turn to the call while it is still streaming", () => {
    const s = run([
      ev("call.state", { callId: "p1", status: "connected", to: "Leo" }),
      ev("transcript.delta", { turnId: "t10", role: "assistant", text: "Hallo" }),
    ]);
    expect(s.call!.turnIds).toEqual(["t10"]);
    const f = reduce(s, ev("transcript.final", { turnId: "t10", role: "assistant", text: "Hallo" }), 5000);
    expect(f.call!.turnIds).toEqual(["t10"]);
  });

  it("clears the computer-use trail when the same task id is created again (looped scenarios)", () => {
    const s = run([
      ev("task.created", { taskId: "k-cu", title: "T", kind: "computer_use" }),
      ev("cu.frame", { taskId: "k-cu", imageUrl: "a", width: 1, height: 1 }),
      ev("cu.action", { taskId: "k-cu", action: "click", x: 1, y: 1, caption: "c", step: 8, totalSteps: 8 }),
      ev("task.done", { taskId: "k-cu", result: "ok" }),
      ev("task.created", { taskId: "k-cu", title: "T", kind: "computer_use" }),
    ]);
    expect(s.cu).toMatchObject({ taskId: "k-cu", frame: null, actions: [] });
    expect(s.tasks["k-cu"]).toMatchObject({ status: "running", createdAt: 1400 });
    expect(s.tasks["k-cu"]!.step).toBeUndefined();
  });

  it("starts a new call record when an ended call id dials again", () => {
    const s = run([
      ev("call.state", { callId: "p1", status: "connected", to: "Leo" }),
      ev("transcript.final", { turnId: "t10", role: "assistant", text: "Hallo" }),
      ev("call.state", { callId: "p1", status: "ended", to: "Leo" }),
      ev("call.state", { callId: "p1", status: "dialing", to: "Leo" }),
    ]);
    expect(s.call).toMatchObject({ status: "dialing", turnIds: [], since: 1300 });
    expect(s.call!.connectedAt).toBeUndefined();
  });

  it("starts a new call record for a new call id", () => {
    const s = run([
      ev("call.state", { callId: "p1", status: "connected", to: "Leo" }),
      ev("transcript.final", { turnId: "t10", role: "assistant", text: "Hallo" }),
      ev("call.state", { callId: "p2", status: "dialing", to: "Praxis" }),
    ]);
    expect(s.call).toMatchObject({ callId: "p2", turnIds: [] });
    expect(s.call!.connectedAt).toBeUndefined();
  });

  it("handles approvals requested and resolved, newest pending first", () => {
    const s = run([
      ev("approval.requested", { approvalId: "a1", title: "Mail", detail: "d", risk: "medium" }),
      ev("approval.resolved", { approvalId: "a1", approved: true, via: "click" }),
    ]);
    expect(s.approvals.a1).toMatchObject({ status: "approved", via: "click", resolvedAt: 1100 });
  });

  it("ignores a second resolution of the same approval", () => {
    const s = run([
      ev("approval.requested", { approvalId: "a1", title: "Mail", detail: "d", risk: "high" }),
      ev("approval.resolved", { approvalId: "a1", approved: false, via: "voice" }),
      ev("approval.resolved", { approvalId: "a1", approved: true, via: "click" }),
    ]);
    expect(s.approvals.a1).toMatchObject({ status: "rejected", via: "voice" });
  });

  it("focuses entities and keeps a deduplicated context rail", () => {
    const s = run([
      ev("ui.focus", { entity: "mail", entityId: "M-003", label: "Dr. Weber" }),
      ev("ui.focus", { entity: "lead", entityId: "L-007", label: "Müller GmbH" }),
      ev("ui.focus", { entity: "mail", entityId: "M-003", label: "Dr. Weber" }),
    ]);
    expect(s.focus).toMatchObject({ entity: "mail", entityId: "M-003", at: 1200, seq: 3 });
    expect(s.context.map((c) => c.entityId)).toEqual(["M-003", "L-007"]);
  });

  it("replaces widgets by id, newest first", () => {
    const s = run([
      ev("ui.widget", { widgetId: "w1", kind: "bar_chart", title: "A", data: [] }),
      ev("ui.widget", { widgetId: "w2", kind: "map", title: "B", data: [] }),
      ev("ui.widget", { widgetId: "w1", kind: "bar_chart", title: "A2", data: [{ label: "x", value: 1 }] }),
    ]);
    expect(s.widgets.map((w) => w.title)).toEqual(["A2", "B"]);
  });

  it("restarts the briefing when item 0 arrives and keeps items ordered", () => {
    const item = (index: number) => ev("briefing.item", { index, total: 3, icon: "mail", title: `P${index}`, detail: "" });
    const s = run([item(0), item(2), item(1), item(0)]);
    expect(s.briefing.items.map((i) => i.title)).toEqual(["P0"]);
    const t = run([item(0), item(2), item(1)]);
    expect(t.briefing).toMatchObject({ total: 3 });
    expect(t.briefing.items.map((i) => i.index)).toEqual([0, 1, 2]);
  });

  it("records latency history", () => {
    const s = run([
      ev("metrics.latency", { turnId: "a", firstAudioMs: 600 }),
      ev("metrics.latency", { turnId: "b", firstAudioMs: 800 }),
    ]);
    expect(s.latency).toEqual({ last: 800, history: [600, 800] });
  });

  it("collects learned tools", () => {
    const s = run([ev("tool.learned", { tool: "praxis_book", description: "Buchen", endpoints: [{ method: "GET", path: "/x" }] })]);
    expect(s.learned[0]).toMatchObject({ tool: "praxis_book", at: 1000 });
    expect(s.log[0]!.kind).toBe("learned");
  });

  it("caps tasks and approvals over a long session", () => {
    let s = initialState;
    for (let i = 0; i < 300; i++) {
      s = reduce(s, ev("task.created", { taskId: `k${i}`, title: "t", kind: "other" }), i);
      s = reduce(s, ev("approval.requested", { approvalId: `a${i}`, title: "t", detail: "", risk: "low" }), i);
    }
    expect(s.taskOrder.length).toBeLessThanOrEqual(50);
    expect(Object.keys(s.tasks).length).toBe(s.taskOrder.length);
    expect(s.approvalOrder.length).toBeLessThanOrEqual(30);
    expect(Object.keys(s.approvals).length).toBe(s.approvalOrder.length);
    expect(s.taskOrder.at(-1)).toBe("k299");
    expect(s.approvalOrder[0]).toBe("a299");
    expect(s.approvals.a299).toBeDefined();
  });

  it("does not invent titles for unknown tasks or approvals", () => {
    const s = run([ev("task.progress", { taskId: "k-x", message: "läuft" }), ev("approval.resolved", { approvalId: "a-x", approved: true, via: "voice" })]);
    expect(s.tasks["k-x"]!.title).toBe("k-x");
    expect(s.approvals["a-x"]!.title).toBe("a-x");
  });

  it("does not mutate the previous state", () => {
    const before = structuredClone(initialState);
    reduce(initialState, ev("task.created", { taskId: "k", title: "t", kind: "other" }), 1);
    expect(initialState).toEqual(before);
  });
});

describe("notice", () => {
  const urgent = { noticeId: "n1", severity: "urgent", title: "Dringende Mail von Dr. Anna Weber", detail: "Dringend: Rückruf heute?", entity: "mail", entityId: "M-061" } as const;

  it("keeps notices newest first with their receive time and logs them", () => {
    const s = run([ev("notice", urgent), ev("notice", { noticeId: "n2", severity: "info", title: "Backup fertig", detail: "ok" })]);
    expect(s.notices.map((n) => [n.noticeId, n.at])).toEqual([["n2", 1100], ["n1", 1000]]);
    expect(s.log.at(-1)).toMatchObject({ kind: "notice", text: "Dringend: Dringende Mail von Dr. Anna Weber", tone: "warn" });
  });

  it("ignores a replayed notice and caps the list", () => {
    const s = run([ev("notice", urgent), ev("notice", urgent), ...Array.from({ length: 8 }, (_, i) => ev("notice", { ...urgent, noticeId: `x${i}` }))]);
    expect(s.notices).toHaveLength(5);
    expect(new Set(s.notices.map((n) => n.noticeId)).size).toBe(5);
    expect(run([ev("notice", urgent), ev("notice", urgent)]).notices).toHaveLength(1);
  });
});
