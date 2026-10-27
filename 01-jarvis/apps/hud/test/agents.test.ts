import { describe, expect, it } from "vitest";
import { makeEvent } from "@jarvis/contracts";
import { initialState, reduce, type HudState, type RunAction } from "@/lib/events/reducer";
import { actionMs, agentDone, playhead, RUN_TIMING, runAgents, runPhase, schedule, summaryAt, summaryLines, typedChars } from "@/lib/agents";
import { stageItem, stageMode, statusLine } from "@/lib/stage";
import { TIMING } from "@/lib/derived";
import { agentRects } from "@/components/stage/layout";

const at = (events: Array<[number, Parameters<typeof reduce>[1]]>, base: HudState = initialState): HudState => events.reduce((s, [t, e]) => reduce(s, e, t), base);
const R = "r1";
const plan = () =>
  makeEvent("run.planned", {
    runId: R,
    title: "Müller GmbH: Unterschrift heute vorbereiten",
    approvalId: "a-run",
    steps: [
      { agentId: "ag-mail", app: "mail", summary: "Zusagen" },
      { agentId: "ag-crm", app: "crm", summary: "Deal schieben" },
    ],
  });
const spawn = (agentId: string, app: "mail" | "crm" | "calendar" | "chat") => makeEvent("agent.spawned", { runId: R, agentId, app, label: `${app} · arbeitet` });
const act = (agentId: string, app: "mail" | "crm" | "calendar" | "chat", action: RunAction["action"], extra: Partial<RunAction> = {}) =>
  makeEvent("agent.action", { runId: R, agentId, app, action, caption: action, ...extra });

describe("run reducer", () => {
  it("a plan with approvalId opens one pending approval for the whole plan", () => {
    const s = at([[1000, plan()]]);
    expect(s.run?.steps).toHaveLength(2);
    expect(s.approvals["a-run"]).toMatchObject({ status: "pending", title: "Müller GmbH: Unterschrift heute vorbereiten" });
    // an approval.requested from the orchestrator for the same id does not duplicate it
    const t = reduce(s, makeEvent("approval.requested", { approvalId: "a-run", title: "x", detail: "y", risk: "medium" }), 1100);
    expect(t.approvalOrder.filter((id) => id === "a-run")).toHaveLength(1);
  });

  it("collects agents and actions; an action without spawn still gets its agent", () => {
    const s = at([[1000, plan()], [2000, spawn("ag-mail", "mail")], [2100, act("ag-crm", "crm", "open")], [2200, act("ag-mail", "mail", "select", { entityId: "M-101" })]]);
    expect(s.run?.agentOrder).toEqual(["ag-mail", "ag-crm"]);
    expect(s.run?.actions.map((a) => a.action)).toEqual(["open", "select"]);
    expect(runAgents(s.run!).map((a) => a.app)).toEqual(["mail", "crm"]);
  });

  it("a new runId starts a fresh run", () => {
    const s = at([[1000, plan()], [2000, spawn("ag-mail", "mail")], [3000, makeEvent("agent.spawned", { runId: "r2", agentId: "x", app: "chat", label: "Slack" })]]);
    expect(s.run?.runId).toBe("r2");
    expect(s.run?.agentOrder).toEqual(["x"]);
  });
});

describe("playback schedule", () => {
  const actions = (s: HudState) => s.run!.actions;

  it("plays one agent's actions one after another, never before they arrived", () => {
    const s = at([[1000, act("a", "mail", "open")], [1000, act("a", "mail", "select", { entityId: "M" })], [5000, act("a", "mail", "send")]]);
    const [open, select, send] = schedule(actions(s)).get("a")!;
    expect(open!.start).toBe(1000);
    expect(select!.start).toBe(open!.end);
    expect(send!.start).toBe(5000);
    expect(select!.hit - select!.start).toBe(actionMs({ action: "select" }).travel);
  });

  it("agents run in parallel", () => {
    const s = at([[1000, act("a", "mail", "open")], [1000, act("b", "crm", "open")]]);
    const m = schedule(actions(s));
    expect(m.get("a")![0]!.start).toBe(1000);
    expect(m.get("b")![0]!.start).toBe(1000);
  });

  it("types character by character between hit and end", () => {
    const s = at([[1000, act("a", "mail", "type", { text: "Hallo Herr Müller" })]]);
    const [t] = schedule(actions(s)).get("a")!;
    expect(typedChars(t!, t!.hit)).toBe(0);
    expect(typedChars(t!, t!.hit + 200)).toBeGreaterThan(0);
    expect(typedChars(t!, t!.end)).toBe("Hallo Herr Müller".length);
    expect(playhead([t!], t!.start - 1).current).toBeNull();
    expect(playhead([t!], t!.end + 10).progress).toBe(1);
  });
});

describe("run phases and the stage", () => {
  const working = () => at([[1000, plan()], [2000, makeEvent("approval.resolved", { approvalId: "a-run", approved: true, via: "voice" })], [2100, spawn("ag-mail", "mail")], [2200, act("ag-mail", "mail", "open")]]);

  it("plan -> work -> summary -> calm", () => {
    const planned = at([[1000, plan()]]);
    expect(runPhase(planned, 1100)).toBe("plan");
    expect(stageItem(planned, 1100)?.kind).toBe("approval");
    expect(statusLine(planned, "open", 1100, 14).text).toBe("Wartet auf deine Freigabe");

    const s = working();
    // the answered plan gives way to the windows at once (no 2.6 s linger)
    expect(stageMode(s, 2300)).toBe("agents");
    expect(statusLine(s, "open", 2300, 14).text).toBe("1 Agent arbeitet");

    const done = at([[2500, makeEvent("agent.finished", { runId: R, agentId: "ag-mail", ok: true, summary: "ok" })], [2600, makeEvent("run.summary", { runId: R, title: "t", tasks: 1, durationMs: 1400, humanMinutes: 3 })]], s);
    const show = summaryAt(done.run!)!;
    // Bild B waits until the HUD has played the last action
    expect(show).toBeGreaterThan(2600);
    expect(stageMode(done, show - 1)).toBe("agents");
    expect(stageMode(done, show + 1)).toBe("summary");
    expect(statusLine(done, "open", show + 1, 14).text).toBe("Erledigt");
    expect(stageMode(done, show + RUN_TIMING.summaryMs + 1)).toBe("calm");
  });

  it("an approved plan stays on stage until its agents start", () => {
    const s = at([[1000, plan()], [2000, makeEvent("approval.resolved", { approvalId: "a-run", approved: true, via: "click" })]]);
    expect(stageItem(s, 2000 + TIMING.approvalLingerMs + 2000)?.kind).toBe("approval");
    const t = reduce(s, spawn("ag-mail", "mail"), 7000);
    expect(stageMode(t, 7100)).toBe("agents");
  });

  it("a rejected plan closes without windows", () => {
    const s = at([[1000, plan()], [2000, makeEvent("approval.resolved", { approvalId: "a-run", approved: false, via: "click" })]]);
    expect(runPhase(s, 2100)).toBe("none");
    expect(stageMode(s, 2000 + TIMING.approvalLingerMs + 100)).toBe("calm");
  });

  it("the run outranks computer use and widgets, a pending approval outranks the run", () => {
    const s = at([[500, makeEvent("ui.widget", { widgetId: "w", kind: "stat", title: "x", data: { value: 1 } })]], working());
    expect(stageMode(s, 2300)).toBe("agents");
    const a = reduce(s, makeEvent("approval.requested", { approvalId: "a2", title: "Mail senden", detail: "d", risk: "low" }), 2400);
    expect(stageItem(a, 2500)?.kind).toBe("approval");
  });

  it("a chip turns done only after its playback is over", () => {
    const s = at([[2300, makeEvent("agent.finished", { runId: R, agentId: "ag-mail", ok: true, summary: "ok" })]], working());
    const end = schedule(s.run!.actions).get("ag-mail")!.at(-1)!.end;
    expect(agentDone(s.run!, "ag-mail", end - 1)).toBe(false);
    expect(agentDone(s.run!, "ag-mail", end)).toBe(true);
  });

  it("a run that never ends is dropped after a while", () => {
    expect(runPhase(working(), 2200 + RUN_TIMING.staleMs + 2000)).toBe("none");
  });
});

describe("summary and window layout", () => {
  it("states the punchline in plain German", () => {
    expect(summaryLines({ tasks: 4, durationMs: 11_200, humanMinutes: 14 })).toMatchObject({ big: "4 Aufgaben · 11 Sekunden", small: "Ein Mensch hätte dafür etwa 14 Minuten gebraucht." });
    expect(summaryLines({ tasks: 1, durationMs: 900, humanMinutes: 1 })).toMatchObject({ big: "1 Aufgabe · 1 Sekunde", small: "Ein Mensch hätte dafür etwa 1 Minute gebraucht." });
  });

  it("arranges 1-4 windows in fixed app order without overlap, one per agent", () => {
    const ag = (apps: readonly string[]) => apps.map((app, i) => ({ agentId: `a${i}`, app: app as "mail" }));
    for (const apps of [["crm"], ["crm", "mail"], ["chat", "crm", "mail"], ["crm", "chat", "calendar", "mail"], ["mail", "mail", "calendar"]] as const) {
      const list = Object.values(agentRects(ag(apps)));
      expect(list).toHaveLength(apps.length);
      for (const a of list) for (const b of list) if (a !== b) expect(a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top).toBe(true);
    }
    const four = agentRects(ag(["crm", "chat", "calendar", "mail"]));
    // a3 = mail, a2 = calendar, a1 = chat
    expect(four.a3!.left).toBeLessThan(four.a2!.left);
    expect(four.a3!.top).toBeLessThan(four.a1!.top);
    expect(Object.keys(agentRects(ag(["mail", "calendar", "chat", "crm", "praxis"])))).toHaveLength(4);
  });
});
