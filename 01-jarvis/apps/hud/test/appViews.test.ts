import { describe, expect, it } from "vitest";
import { makeEvent } from "@jarvis/contracts";
import { initialState, reduce, type HudState, type RunAction } from "@/lib/events/reducer";
import { schedule, type Played } from "@/lib/agents";
import { calendarView, chatView, crmView, mailView, slotOf } from "@/lib/apps/views";
import { demoData } from "@/lib/apps/fixtures";

const data = demoData(new Date(2026, 9, 12, 9, 0));
const played = (steps: Array<[number, Partial<RunAction> & Pick<RunAction, "action">]>, app: RunAction["app"]): Played[] => {
  const s = steps.reduce<HudState>((acc, [t, a]) => reduce(acc, makeEvent("agent.action", { runId: "r", agentId: "a", app, caption: a.action, ...a }), t), initialState);
  return schedule(s.run!.actions).get("a")!;
};
const after = (p: Played[]) => p.at(-1)!.end + 1;

describe("demo data", () => {
  it("tells the Drehbuch story", () => {
    expect(data.emails[0]).toMatchObject({ id: "M-101", fromName: "Thomas Müller", subject: "Unterschrift heute möglich?", unread: true });
    expect(data.leads.find((l) => l.id === "L-001")).toMatchObject({ company: "Müller GmbH", status: "angebot", valueEur: 84000, score: 92 });
    expect(Object.keys(data.chat)).toEqual(["allgemein", "vertrieb", "delivery"]);
    expect(data.events.some((e) => e.title.startsWith("Dr. Weber"))).toBe(true);
  });
});

describe("mail view", () => {
  it("selects, types the reply and sends it", () => {
    const p = played([[0, { action: "select", entityId: "M-102" }], [0, { action: "type", text: "Gern, bis morgen." }], [0, { action: "send" }]], "mail");
    expect(mailView(data.emails, p, 0).selectedId).toBe("M-101"); // before anything: the urgent unread mail
    const typing = mailView(data.emails, p, p[1]!.hit + 150);
    expect(typing.selectedId).toBe("M-102");
    expect(typing.draft?.shown.length).toBeGreaterThan(0);
    expect(typing.draft?.sent).toBe(false);
    const done = mailView(data.emails, p, after(p));
    expect(done.draft).toMatchObject({ shown: "Gern, bis morgen.", sent: true });
    expect(done.replied).toEqual(["M-102"]);
  });
});

describe("calendar view", () => {
  const today = new Date(2026, 9, 12, 9, 0);
  it("finds the slot in `to` (ISO or HH:MM) or the caption", () => {
    expect(slotOf({ to: "2026-10-12T15:00", caption: "" }, today)?.getHours()).toBe(15);
    expect(slotOf({ to: "15:30", caption: "" }, today)?.getMinutes()).toBe(30);
    expect(slotOf({ caption: "Wählt heute 15 Uhr" }, today)?.getHours()).toBe(15);
    expect(slotOf({ caption: "Öffnet den Kalender" }, today)).toBeNull();
    expect(slotOf({ caption: "Termin am 12.10. um 15 Uhr" }, today)?.getHours()).toBe(15);
    expect(slotOf({ caption: "Wählt 15.30 Uhr" }, today)?.getMinutes()).toBe(30);
  });

  it("ghost -> typed title -> created", () => {
    const p = played([[0, { action: "select", to: "2026-10-12T15:00" }], [0, { action: "type", field: "title", text: "Unterschrift Müller GmbH" }], [0, { action: "create", entityId: "E-301" }]], "calendar");
    expect(calendarView(data.events, p, p[0]!.hit - 1, today).ghost).toBeNull();
    expect(calendarView(data.events, p, p[0]!.hit, today).ghost?.state).toBe("ghost");
    const done = calendarView(data.events, p, after(p), today).ghost!;
    expect(done).toMatchObject({ state: "created" });
    expect(done.title?.shown).toBe("Unterschrift Müller GmbH");
    expect(done.end.getTime() - done.start.getTime()).toBe(3_600_000);
    // once the live data has the event, the ghost gives way
    const live = [...data.events, { id: "E-301", title: "Unterschrift Müller GmbH", start: "2026-10-12T15:00:00+02:00", end: "2026-10-12T16:00:00+02:00", location: "", attendees: [], leadId: null }];
    expect(calendarView(live, p, after(p), today).ghost).toBeNull();
  });
});

describe("chat view", () => {
  it("switches channel, types and posts as Jarvis", () => {
    const p = played([[0, { action: "select", entityId: "vertrieb" }], [0, { action: "type", text: "Müller unterschreibt heute." }], [0, { action: "send", entityId: "C-399" }]], "chat");
    const typing = chatView(data.chat, p, p[1]!.hit + 100);
    expect(typing.channel).toBe("vertrieb");
    expect(typing.compose?.active).toBe(true);
    const done = chatView(data.chat, p, after(p));
    expect(done.compose).toBeNull();
    expect(done.sent).toEqual([expect.objectContaining({ id: "C-399", text: "Müller unterschreibt heute.", fromJarvis: true, channel: "vertrieb" })]);
  });
});

describe("crm view", () => {
  it("the card stays in its column until it is dropped", () => {
    const p = played([[0, { action: "select", entityId: "L-001" }], [0, { action: "move", entityId: "L-001", from: "angebot", to: "verhandlung" }]], "crm");
    const move = p[1]!;
    const status = (now: number) => crmView(data.leads, p, now).leads.find((l) => l.id === "L-001")!.status;
    expect(crmView(data.leads, p, move.start + 10).moving?.flying).toBe(false);
    expect(crmView(data.leads, p, move.hit + 10).moving).toMatchObject({ flying: true, from: "angebot", to: "verhandlung" });
    expect(status(move.hit + 10)).toBe("angebot");
    expect(status(move.end)).toBe("verhandlung");
    expect(crmView(data.leads, p, move.end).movedAt["L-001"]).toBe(move.end);
  });

  it("ignores moves to unknown columns", () => {
    const p = played([[0, { action: "move", entityId: "L-001", to: "irgendwo" }]], "crm");
    expect(crmView(data.leads, p, after(p)).leads.find((l) => l.id === "L-001")!.status).toBe("angebot");
  });
});
