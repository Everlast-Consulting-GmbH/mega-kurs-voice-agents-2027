// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { makeEvent, type JarvisEvent } from "@jarvis/contracts";
import { desktopEvent } from "@/lib/apps/desktop";
import { demoData } from "@/lib/apps/fixtures";
import { initialState, reduce, type HudState } from "@/lib/events/reducer";
import { useHud } from "@/lib/events/store";
import { stageItem } from "@/lib/stage";
import { useUi } from "@/lib/ui";
import { StageView } from "@/components/stage/StageView";
import { stageLocked, stageSticky } from "@/components/stage/AppDock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLCanvasElement.prototype.getContext = (() => null) as never;

const leads = demoData().leads;
const focusMail = makeEvent("ui.focus", { entity: "mail", entityId: "M-101", label: "Mail" });
/** Reduces events at the given offsets (ms) relative to `now`, then the focus at `now`, like the store does before listeners run. */
function decide(events: Array<[number, JarvisEvent]>, focus: JarvisEvent = focusMail, now = Date.now()) {
  let s: HudState = initialState;
  for (const [dt, e] of events) s = reduce(s, e, now + dt);
  s = reduce(s, focus, now);
  return { s, decision: desktopEvent(focus, s, leads, now) };
}

const briefing = makeEvent("briefing.item", { index: 0, total: 3, icon: "calendar", title: "3 Termine", detail: "10:00" });
const widget = makeEvent("ui.widget", { widgetId: "w", kind: "bar_chart", title: "Pipeline", data: [{ label: "a", value: 1 }] });
const planned = makeEvent("run.planned", { runId: "r", title: "Müller", steps: [{ agentId: "m", app: "mail", summary: "Mail" }] });
const spawned = makeEvent("agent.spawned", { runId: "r", agentId: "m", app: "mail", label: "Mail" });
const action = makeEvent("agent.action", { runId: "r", agentId: "m", app: "mail", action: "open", caption: "Öffnet" });
const summary = makeEvent("run.summary", { runId: "r", title: "Erledigt", tasks: 1, durationMs: 8000, humanMinutes: 10 });
const cuTask = makeEvent("task.created", { taskId: "k", title: "Termin", kind: "computer_use" });
const cuFrame = makeEvent("cu.frame", { taskId: "k", imageUrl: "x", width: 1280, height: 800 });
const approval = makeEvent("approval.requested", { approvalId: "a", title: "Senden?", detail: "Mail", risk: "low" });

describe("desktopEvent keeps native scenes", () => {
  it("opens the app on a calm stage", () => {
    expect(decide([]).decision).toEqual({ app: "mail", entityId: "M-101" });
  });

  it.each([
    ["briefing", [[-1000, briefing]]],
    ["widget", [[-1000, widget]]],
    ["agents at work", [[-2000, planned], [-1500, spawned], [-1000, action]]],
    ["run summary", [[-6000, planned], [-5500, spawned], [-5000, summary]]],
    ["computer use", [[-1000, cuTask], [-900, cuFrame]]],
    ["pending approval", [[-1000, approval]]],
  ] as Array<[string, Array<[number, JarvisEvent]>]>)("does not cover the %s", (_, events) => {
    expect(decide(events).decision).toBeNull();
  });

  it("opens again once an old briefing, widget and run have expired", () => {
    const old: Array<[number, JarvisEvent]> = [[-120_000, briefing], [-110_000, widget], [-100_000, planned], [-99_000, spawned], [-98_000, summary]];
    expect(decide(old).decision).toMatchObject({ app: "mail" });
  });

  it("closes the old workspace for an unsupported focus, even over a native scene", () => {
    const task = makeEvent("ui.focus", { entity: "task", entityId: "T-1", label: "Aufgabe" });
    expect(decide([], task).decision).toBe("close");
    expect(decide([[-1000, widget]], task).decision).toBe("close");
  });
});

describe("dock guard and sticky items", () => {
  it("locks approval, agents at work and computer use, but not summary, widget or focus", () => {
    const now = Date.now();
    const item = (events: Array<[number, JarvisEvent]>) => stageItem(decide(events, focusMail, now).s, now);
    expect(stageLocked(item([[-1000, approval]]))).toBe(true);
    expect(stageLocked(item([[-2000, planned], [-1500, spawned], [-1000, action]]))).toBe(true);
    expect(stageLocked(item([[-1000, cuTask], [-900, cuFrame]]))).toBe(true);
    expect(stageLocked(item([[-6000, planned], [-5500, spawned], [-5000, summary]]))).toBe(false);
    expect(stageLocked(item([[-1000, widget]]))).toBe(false);
    expect(stageLocked(item([]))).toBe(false);
    expect(stageSticky(item([[-6000, planned], [-5500, spawned], [-5000, summary]]))).toBe(true);
    expect(stageSticky(item([]))).toBe(false);
  });
});

describe("StageView priority over an open app", () => {
  beforeEach(() => {
    useHud.getState().reset();
    useUi.setState({ workspace: null, hiddenStageKey: null, explain: false, dismissed: new Set() });
  });
  const mount = async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(StageView)));
    return { host, unmount: () => act(async () => root.unmount()) };
  };
  const mode = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-testid=stage-view]")?.dataset.mode;

  it("shows a pending approval and computer use even if an app stayed open", async () => {
    const { host, unmount } = await mount();
    await act(async () => useUi.getState().openApp("crm"));
    expect(mode(host)).toBe("desktop");
    await act(async () => useHud.getState().apply(approval));
    expect(mode(host)).toBe("stage");
    expect(host.querySelector("[data-testid=stage-approval]")).not.toBeNull();
    expect((host.querySelector("[data-testid=dock-mail]") as HTMLButtonElement).disabled).toBe(true);
    await unmount();
  });

  it("a call always takes the stage, even over an open app or a hidden focus", async () => {
    const { host, unmount } = await mount();
    await act(async () => useHud.getState().apply(focusMail));
    const key = stageItem(useHud.getState(), Date.now())!.key;
    await act(async () => useUi.getState().closeApp(key));
    await act(async () => useUi.getState().openApp("mail"));
    await act(async () => useHud.getState().apply(makeEvent("call.state", { callId: "call", to: "me", status: "dialing" })));
    expect(mode(host)).toBe("call");
    expect(host.querySelector("[data-testid=system-watch]")).toBeNull();
    expect(host.querySelector("[data-testid=desktop-workspace]")).toBeNull();
    await unmount();
  });

  it("ignores a sticky item stored as hidden, so it can never vanish for good", async () => {
    const { host, unmount } = await mount();
    await act(async () => useHud.getState().apply(approval));
    await act(async () => useUi.setState({ hiddenStageKey: "approval-a" }));
    expect(mode(host)).toBe("stage");
    expect(host.querySelector("[data-testid=stage-approval]")).not.toBeNull();
    await unmount();
  });
});
