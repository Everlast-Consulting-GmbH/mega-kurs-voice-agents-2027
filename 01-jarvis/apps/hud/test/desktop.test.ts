import { describe, expect, it } from "vitest";
import { makeEvent } from "@jarvis/contracts";
import { desktopContext, desktopEvent, rehearsalAnswer } from "@/lib/apps/desktop";
import { useCrmDemo, withOverrides } from "@/lib/apps/crmDemo";
import { demoData } from "@/lib/apps/fixtures";
import { initialState, reduce } from "@/lib/events/reducer";

const data = demoData();

describe("desktop event integration", () => {
  it("resolves the focused company despite the mock-world and HUD having different IDs", () => {
    const event = makeEvent("ui.focus", { entity: "lead", entityId: "L-007", label: "Angebot Müller GmbH" });
    expect(desktopEvent(event, initialState, data.leads)).toEqual({ app: "offer", entityId: data.leads.find((l) => l.company === "Müller GmbH")!.id });
  });
  it("lets a fresh focus open after an old completed run, while a running agent keeps its stage", () => {
    const now = Date.now();
    let s = reduce(initialState, makeEvent("run.planned", { runId: "r", title: "Prüfen", steps: [{ agentId: "mail", app: "mail", summary: "Mail" }] }), now - 60_000);
    s = reduce(s, makeEvent("run.summary", { runId: "r", title: "Erledigt", tasks: 1, durationMs: 8500, humanMinutes: 10 }), now - 30_000);
    expect(desktopEvent(makeEvent("ui.focus", { entity: "mail", entityId: "M-101", label: "Mail" }), s, data.leads, now)).toMatchObject({ app: "mail" });
    expect(desktopEvent(makeEvent("approval.requested", { approvalId: "a", title: "Senden?", detail: "Mail", risk: "low" }), s, data.leads, now)).toBe("close");
  });
  it("keeps a moved deal in the question context across opening other apps and resets it", () => {
    const lead = data.leads[0]!;
    useCrmDemo.getState().reset();
    useCrmDemo.getState().dispatch({ type: "move", lead, to: "verhandlung" });
    const snapshot = { ...data, leads: withOverrides(data.leads, useCrmDemo.getState().state) };
    const workspace = { app: "crm" as const, entityId: lead.id };
    expect(desktopContext(workspace, snapshot)).toContain("Phase Verhandlung");
    expect(rehearsalAnswer("Nächster Schritt?", workspace, snapshot)).toContain("Verhandlung");
    useCrmDemo.getState().reset();
    expect(withOverrides(data.leads, useCrmDemo.getState().state)[0]!.status).toBe(lead.status);
  });
  it("uses actual visible deal data for the question and its offline answer", () => {
    const lead = data.leads[0]!;
    const workspace = { app: "crm" as const, entityId: lead.id };
    expect(desktopContext(workspace, data)).toContain(lead.email);
    expect(rehearsalAnswer("Nächster Schritt?", workspace, data)).toContain(lead.nextStep);
  });
});

describe("spoken app navigation", () => {
  it.each([
    ["Öffne bitte mein CRM", "crm"],
    ["Mach mal die Mails auf", "mail"],
    ["Zeig mir das Angebot für Müller", "offer"],
    ["Öffne den Kalender", "calendar"],
  ])("opens the requested app from the final user turn: %s", (text, app) => {
    const event = makeEvent("transcript.final", { turnId: "command", role: "user", text });
    const s = reduce(initialState, event, Date.now());
    expect(desktopEvent(event, s, data.leads)).toMatchObject({ app });
  });
});
