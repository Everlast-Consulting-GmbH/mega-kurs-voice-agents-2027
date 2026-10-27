import { describe, expect, it } from "vitest";
import type { Lead } from "@jarvis/contracts";
import { crmDemoReducer, draftMessage, initialCrmDemo, leadTimeline, matchesLead, nextStatus, visibleLeads, withOverrides, type CrmDemoState } from "@/lib/apps/crmDemo";

const NOW = new Date(2026, 9, 12, 9, 0).getTime();
const sample = (over: Partial<Lead> = {}): Lead => ({
  id: "L-001",
  name: "Thomas Müller",
  company: "Müller GmbH",
  email: "kontakt@m-ller-gmbh.example",
  phone: "+49 30 23125000",
  city: "München",
  lat: 48.137,
  lng: 11.575,
  status: "angebot",
  valueEur: 84000,
  score: 92,
  lastContactAt: new Date(NOW - 2 * 3_600_000).toISOString(),
  nextStep: "Unterschrift für KI-Telefonassistent",
  notes: "Maschinenbau, 140 Mitarbeitende.",
  ...over,
});
const leads = [sample(), sample({ id: "L-004", name: "Henrik Olsen", company: "Nordlicht Logistik", city: "Bremen", status: "qualifiziert", score: 64, nextStep: "Use Cases priorisieren" })];

describe("crm demo state", () => {
  it("starts closed, unfiltered and without local changes", () => {
    expect(initialCrmDemo).toMatchObject({ selectedId: null, query: "", filter: "alle", overrides: {}, log: [], notice: null });
  });

  it("selects a deal and closes the detail again", () => {
    const s = crmDemoReducer(initialCrmDemo, { type: "select", id: "L-001" });
    expect(s.selectedId).toBe("L-001");
    expect(crmDemoReducer(s, { type: "close" }).selectedId).toBeNull();
  });

  it("moves a deal locally, logs it and confirms it", () => {
    const s = crmDemoReducer(initialCrmDemo, { type: "move", lead: sample(), to: "verhandlung" });
    expect(s.overrides).toEqual({ "L-001": "verhandlung" });
    expect(s.log).toEqual([{ seq: 1, leadId: "L-001", kind: "move", from: "angebot", to: "verhandlung" }]);
    expect(s.notice).toMatchObject({ leadId: "L-001", tone: "success" });
    expect(s.notice!.text).toContain("Müller GmbH");
    expect(s.notice!.text).toContain("Verhandlung");
    // the source data stays untouched; only the derived view changes
    expect(leads[0]!.status).toBe("angebot");
    expect(withOverrides(leads, s).find((l) => l.id === "L-001")!.status).toBe("verhandlung");
  });

  it("ignores a move to the same phase", () => {
    const s = crmDemoReducer(initialCrmDemo, { type: "move", lead: sample(), to: "angebot" });
    expect(s).toBe(initialCrmDemo);
  });

  it("does not override the deal the agent is dragging", () => {
    const s = crmDemoReducer(initialCrmDemo, { type: "move", lead: sample(), to: "gewonnen" });
    expect(withOverrides(leads, s, "L-001").find((l) => l.id === "L-001")!.status).toBe("angebot");
  });

  it("knows the next phase of the pipeline", () => {
    expect(nextStatus("qualifiziert")).toBe("angebot");
    expect(nextStatus("angebot")).toBe("verhandlung");
    expect(nextStatus("verhandlung")).toBe("gewonnen");
    expect(nextStatus("gewonnen")).toBeNull();
    expect(nextStatus("verloren")).toBeNull();
  });
});

describe("crm demo search", () => {
  it("matches company, contact, city and next step without accents", () => {
    expect(matchesLead(sample(), "muller", "alle")).toBe(true);
    expect(matchesLead(sample(), "MÜNCHEN", "alle")).toBe(true);
    expect(matchesLead(sample(), "unterschrift", "alle")).toBe(true);
    expect(matchesLead(sample(), "bremen", "alle")).toBe(false);
  });

  it("filters by phase and by hot score", () => {
    expect(matchesLead(sample(), "", "angebot")).toBe(true);
    expect(matchesLead(sample(), "", "qualifiziert")).toBe(false);
    expect(matchesLead(sample(), "", "heiss")).toBe(true);
    expect(matchesLead(sample({ score: 64 }), "", "heiss")).toBe(false);
  });

  it("applies query and filter from the state and respects local moves", () => {
    let s: CrmDemoState = crmDemoReducer(initialCrmDemo, { type: "search", query: "nord" });
    expect(visibleLeads(leads, s).map((l) => l.id)).toEqual(["L-004"]);
    s = crmDemoReducer(s, { type: "search", query: "" });
    s = crmDemoReducer(s, { type: "filter", filter: "verhandlung" });
    expect(visibleLeads(leads, s)).toEqual([]);
    s = crmDemoReducer(s, { type: "move", lead: sample(), to: "verhandlung" });
    expect(visibleLeads(leads, s).map((l) => l.id)).toEqual(["L-001"]);
  });
});

describe("crm demo detail", () => {
  it("prepares a deterministic local draft", () => {
    const s = crmDemoReducer(initialCrmDemo, { type: "draft", lead: sample() });
    expect(s.drafts["L-001"]).toBe(draftMessage(sample()));
    expect(s.drafts["L-001"]).toContain("Guten Tag Thomas Müller,");
    expect(s.drafts["L-001"]).toContain("Unterschrift für KI-Telefonassistent");
    expect(s.notice).toMatchObject({ tone: "info" });
    expect(draftMessage(sample())).toBe(draftMessage(sample()));
  });

  it("builds a timeline from the deal, newest first", () => {
    let s = crmDemoReducer(initialCrmDemo, { type: "move", lead: sample(), to: "verhandlung" });
    const moved = withOverrides(leads, s)[0]!;
    s = crmDemoReducer(s, { type: "draft", lead: moved });
    const t = leadTimeline(moved, s.log, NOW);
    expect(t[0]).toMatchObject({ label: "Nachricht vorbereitet", local: true });
    expect(t[1]).toMatchObject({ label: "Verschoben nach Verhandlung", local: true });
    expect(t.find((e) => e.label === "Letzter Kontakt")?.when).toBe("vor 2 Std.");
    expect(t.filter((e) => !e.local).map((e) => e.label)).toEqual(["Letzter Kontakt", "In Verhandlung", "Angebot versendet", "Qualifiziert", "Lead erfasst"]);
  });

  it("reports an offer without a linked view as local", () => {
    const s = crmDemoReducer(initialCrmDemo, { type: "offer", lead: sample(), linked: false });
    expect(s.notice).toMatchObject({ tone: "info" });
    expect(s.notice!.text).toContain("nicht verbunden");
    expect(crmDemoReducer(s, { type: "dismiss" }).notice).toBeNull();
  });
});
