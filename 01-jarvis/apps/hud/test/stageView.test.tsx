// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { makeEvent } from "@jarvis/contracts";
import { StageView } from "@/components/stage/StageView";
import { useHud } from "@/lib/events/store";
import { useUi } from "@/lib/ui";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no WebGL; the sphere simply stays undrawn.
HTMLCanvasElement.prototype.getContext = (() => null) as never;

async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<StageView />));
  return { host, unmount: () => act(async () => root.unmount()) };
}
const settle = (ms = 700) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const apply = (e: Parameters<ReturnType<typeof useHud.getState>["apply"]>[0]) => act(() => useHud.getState().apply(e));
const q = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);

describe("StageView", () => {
  beforeEach(() => {
    useHud.getState().reset();
    useHud.getState().setConnection({ state: "open", attempt: 0, since: Date.now() });
    useUi.setState({ explain: false, dismissed: new Set() });
  });

  it("is calm without content; the briefing fans out calendar, mail and CRM, the current one in front", async () => {
    const { host, unmount } = await mount();
    expect(q(host, "stage-view")?.dataset.mode).toBe("calm");
    expect(q(host, "stage-panel")).toBeNull();
    apply(makeEvent("briefing.item", { index: 0, total: 3, icon: "calendar", title: "3 Termine heute", detail: "Erster um 10:00" }));
    apply(makeEvent("briefing.item", { index: 1, total: 3, icon: "mail", title: "2 dringende Mails", detail: "Dr. Weber wartet" }));
    await settle();
    expect(q(host, "stage-view")?.dataset.mode).toBe("desk");
    expect(q(host, "stage-panel")).toBeNull();
    expect(q(host, "briefing-window-mail")?.dataset.on).toBe("true");
    expect(q(host, "briefing-window-calendar")?.dataset.on).toBeUndefined();
    expect(q(host, "status-line")?.textContent).toContain("Liest Kalender, Mails, CRM");
    await unmount();
  });

  it("asks for approval with two buttons and says honestly when the click could not be sent", async () => {
    const { host, unmount } = await mount();
    apply(makeEvent("approval.requested", { approvalId: "a1", title: "Mail an Dr. Weber senden", detail: "Betreff: Termin", risk: "medium" }));
    await settle();
    expect(q(host, "stage-approval")?.dataset.status).toBe("pending");
    await act(async () => q(host, "approval-approve")!.click());
    // no event stream in the test: nothing went out, so nothing is shown as approved
    expect(q(host, "stage-approval")?.dataset.status).toBe("pending");
    expect(q(host, "stage-approval")?.textContent).toContain("Nicht gesendet");
    await unmount();
  });

  it("an urgent notice arrives as a notification top right; a click dismisses it", async () => {
    const { host, unmount } = await mount();
    apply(makeEvent("notice", { noticeId: "n1", severity: "urgent", title: "Thomas Müller", detail: "Unterschrift heute möglich?", entity: "mail", entityId: "M-101" }));
    await settle();
    expect(q(host, "notice-toast")?.textContent).toContain("Unterschrift heute möglich?");
    expect(q(host, "notice-toast")?.textContent).toContain("Mail");
    expect(q(host, "stage-panel")).toBeNull();
    expect(q(host, "status-line")?.textContent).toContain("Dringende Mail");
    await act(async () => q(host, "notice-toast")!.click());
    await settle();
    expect(q(host, "notice-toast")).toBeNull();
    await unmount();
  });

  it("Bild A/B: a plan, then four app windows with chips and cursors, then the punchline", async () => {
    const { host, unmount } = await mount();
    const R = "r-mueller";
    apply(makeEvent("run.planned", { runId: R, title: "Müller GmbH: Unterschrift heute", approvalId: "a-run", steps: [{ agentId: "m", app: "mail", summary: "Zusagen" }] }));
    await settle();
    expect(q(host, "stage-plan")?.dataset.status).toBe("pending");
    expect(q(host, "plan-step-0")?.textContent).toContain("Mail");
    apply(makeEvent("approval.resolved", { approvalId: "a-run", approved: true, via: "voice" }));
    for (const [agentId, app] of [["m", "mail"], ["k", "calendar"], ["c", "chat"], ["d", "crm"]] as const) {
      apply(makeEvent("agent.spawned", { runId: R, agentId, app, label: `${app} · arbeitet` }));
      apply(makeEvent("agent.action", { runId: R, agentId, app, action: "open", caption: "Öffnet" }));
    }
    apply(makeEvent("agent.action", { runId: R, agentId: "m", app: "mail", action: "select", entityId: "M-101", caption: "Öffnet die Mail" }));
    await settle();
    expect(q(host, "stage-view")?.dataset.mode).toBe("agents");
    expect(q(host, "agents-desk")?.dataset.agents).toBe("4");
    for (const app of ["mail", "calendar", "chat", "crm"]) expect(q(host, `app-${app}`)).not.toBeNull();
    expect(host.querySelectorAll("[data-testid=agent-chip]")).toHaveLength(4);
    expect(host.querySelectorAll("[data-testid=agent-cursor]").length).toBeGreaterThan(0);
    expect(q(host, "app-mail")?.textContent).toContain("Unterschrift heute möglich?");

    for (const id of ["m", "k", "c", "d"]) apply(makeEvent("agent.finished", { runId: R, agentId: id, ok: true, summary: "ok" }));
    apply(makeEvent("run.summary", { runId: R, title: "t", tasks: 4, durationMs: 11_000, humanMinutes: 14 }));
    await settle(2600);
    expect(q(host, "stage-view")?.dataset.mode).toBe("summary");
    expect(q(host, "run-summary")?.textContent).toContain("4 Aufgaben · 11 Sekunden");
    expect(q(host, "run-summary")?.textContent).toContain("etwa 14 Minuten");
    await unmount();
  });

  it("the call hides the stage and shows only Jarvis and the call", async () => {
    const { host, unmount } = await mount();
    apply(makeEvent("ui.widget", { widgetId: "w", kind: "bar_chart", title: "Pipeline nach Monat", data: [{ label: "2026-09", value: 1 }, { label: "2026-10", value: 2 }] }));
    apply(makeEvent("call.state", { callId: "p", status: "ringing", to: "Leo" }));
    await settle();
    expect(q(host, "stage-view")?.dataset.mode).toBe("call");
    expect(q(host, "stage-panel")).toBeNull();
    expect(q(host, "call-moment")?.textContent).toContain("KLINGELT");
    expect(q(host, "call-moment")?.textContent).toContain("Jarvis ruft Leo an");
    await unmount();
  });

  it("key D's explain bar tells the last turn in four plain steps", async () => {
    const { host, unmount } = await mount();
    apply(makeEvent("transcript.final", { turnId: "u", role: "user", text: "Was ist heute wichtig?" }));
    apply(makeEvent("tool.started", { callId: "c", tool: "get_briefing", args: {} }));
    apply(makeEvent("tool.finished", { callId: "c", tool: "get_briefing", ok: true, summary: "5 Punkte im Briefing", durationMs: 90 }));
    await act(async () => useUi.getState().toggleExplain());
    await settle(300);
    expect(q(host, "explain-GEHÖRT")?.textContent).toContain("„Was ist heute wichtig?“");
    expect(q(host, "explain-VERSTANDEN")?.textContent).toContain("Frage nach dem Tag");
    expect(q(host, "explain-WERKZEUG")?.textContent).toContain("Briefing erstellt · 5 Punkte im Briefing, 90 ms");
    expect(q(host, "explain-WERKZEUG")?.dataset.on).toBe("true");
    await unmount();
  });
});
