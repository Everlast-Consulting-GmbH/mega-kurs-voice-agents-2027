import { describe, expect, it } from "vitest";
import { makeEvent } from "@jarvis/contracts";
import { initialState, reduce, type HudState } from "@/lib/events/reducer";
import { TIMING } from "@/lib/derived";
import {
  axisLabel,
  callSentence,
  cuCaption,
  currentBriefingIndex,
  explainTurn,
  focusFacts,
  greeting,
  maskNumber,
  priorUserLine,
  STAGE_HOLD_MS,
  stageItem,
  stageMode,
  statusLine,
  subtitleLine,
  SUBTITLE_HOLD_MS,
  progressStrokes,
  widgetDataset,
  widgetInsight,
} from "@/lib/stage";

const at = (events: Array<[number, Parameters<typeof reduce>[1]]>, base: HudState = initialState): HudState => events.reduce((s, [t, e]) => reduce(s, e, t), base);
const item = (index: number, title = `P${index}`, extra: Partial<{ detail: string; metric: { label: string; value: number; unit?: string } }> = {}) =>
  makeEvent("briefing.item", { index, total: 3, icon: "calendar", title, detail: extra.detail ?? "d", metric: extra.metric });
const widget = (id: string, data: unknown = [], title = "Pipeline nach Monat") => makeEvent("ui.widget", { widgetId: id, kind: "bar_chart", title, data });
const notice = (id: string) => makeEvent("notice", { noticeId: id, severity: "urgent", title: "Dr. Weber: Termin verschieben?", detail: "Bitte bis heute Abend", entity: "mail", entityId: "M-009" });
const approval = (id: string) => makeEvent("approval.requested", { approvalId: id, title: "Mail an Dr. Weber senden", detail: "Betreff: Termin", risk: "medium" });
const cu = (): Array<[number, Parameters<typeof reduce>[1]]> => [
  [1100, makeEvent("task.created", { taskId: "k", title: "Termin für Dr. Weber eintragen", kind: "computer_use" })],
  [1200, makeEvent("cu.frame", { taskId: "k", imageUrl: "x", width: 1280, height: 800 })],
];

describe("stageItem / stageMode", () => {
  it("is calm when nothing is going on", () => {
    expect(stageItem(initialState, 0)).toBeNull();
    expect(stageMode(initialState, 0)).toBe("calm");
  });

  it("opens the stage for the briefing and closes it ~12 s after the last point", () => {
    const s = at([[1000, item(0)], [2000, item(1)]]);
    expect(stageItem(s, 2500)?.kind).toBe("briefing");
    // Bild C: the briefing fans out the apps instead of opening the stage panel
    expect(stageMode(s, 2500)).toBe("desk");
    expect(stageItem(s, 2000 + STAGE_HOLD_MS + 1)).toBeNull();
  });

  it("a widget replaces the briefing, and the briefing does not come back", () => {
    const s = at([[1000, item(0)], [2000, widget("w1")]]);
    expect(stageItem(s, 2500)?.kind).toBe("widget");
    // a focus arriving during the briefing stays behind it (lower priority)
    const t = at([[1000, item(0)], [1500, makeEvent("ui.focus", { entity: "lead", entityId: "L-1", label: "Müller GmbH" })], [2000, item(1)]]);
    expect(stageItem(t, 2100)?.kind).toBe("briefing");
  });

  it("follows the priority: approval > computer use > widget > briefing > focus; notices stay off the stage", () => {
    const base = at([[1000, item(0)], [1050, widget("w1")], ...cu()]);
    expect(stageMode(base, 1300)).toBe("cu");
    const n = reduce(base, notice("n1"), 1400);
    expect(stageItem(n, 1500)?.kind).toBe("cu");
    const a = reduce(n, approval("a1"), 1600);
    expect(stageItem(a, 1700)?.kind).toBe("approval");
  });

  it("an answered approval stays until it can be read; the notice it answered does not return", () => {
    const s = at([[1000, notice("n1")], [2000, approval("a1")], [3000, makeEvent("approval.resolved", { approvalId: "a1", approved: true, via: "voice" })]]);
    expect(stageItem(s, 3000 + TIMING.approvalLingerMs - 100)?.kind).toBe("approval");
    expect(stageItem(s, 3000 + TIMING.approvalLingerMs + 100)).toBeNull();
  });

  it("the agent window comes back after an approval while the agent still works", () => {
    const s = at([...cu(), [2000, approval("a1")], [2500, makeEvent("approval.resolved", { approvalId: "a1", approved: true, via: "click" })]]);
    expect(stageItem(s, 2600)?.kind).toBe("approval");
    expect(stageMode(s, 2500 + TIMING.approvalLingerMs + 100)).toBe("cu");
  });

  it("an approval requested during a call is not hidden behind it", () => {
    const s = at([[1000, makeEvent("call.state", { callId: "p", status: "connected", to: "Leo" })], [2000, approval("a1")]]);
    expect(stageMode(s, 2100)).toBe("stage");
    expect(stageItem(s, 2100)?.kind).toBe("approval");
  });

  it("a call hides everything else", () => {
    const s = at([[1000, approval("a1")], [2000, makeEvent("call.state", { callId: "p", status: "ringing", to: "Leo" })]]);
    expect(stageMode(s, 2100)).toBe("call");
  });

  it("info notices never take the stage", () => {
    const s = at([[1000, makeEvent("notice", { noticeId: "i", severity: "info", title: "Neue Mail", detail: "x" })]]);
    expect(stageItem(s, 1100)).toBeNull();
  });
});

describe("statusLine", () => {
  const tools = 14;
  it("says ready with the number of tools when idle", () => {
    expect(statusLine(initialState, "open", 0, tools)).toEqual({ text: "Bereit · 14 Werkzeuge", tone: "live" });
  });

  it("names what Jarvis reads, drives or shows in plain German", () => {
    const s = at([[1000, makeEvent("tool.started", { callId: "c", tool: "get_briefing", args: {} })]]);
    expect(statusLine(s, "open", 1100, tools).text).toBe("Liest Kalender, Mails, CRM");
    expect(statusLine(at(cu()), "open", 1300, tools).text).toBe("Bedient PraxisPilot");
    expect(statusLine(at([[1000, widget("w")]]), "open", 4000, tools).text).toBe("Zeigt Pipeline");
    expect(statusLine(at([[1000, makeEvent("call.state", { callId: "p", status: "connected", to: "Leo" })]]), "open", 1100, tools).text).toBe("Ausgehender Anruf");
  });

  it("warns when the event stream is down", () => {
    expect(statusLine(initialState, "reconnecting", 0, tools)).toEqual({ text: "Verbindung unterbrochen", tone: "warn" });
  });
});

describe("explainTurn", () => {
  it("explains the last turn in four plain steps", () => {
    const s = at([
      [1000, makeEvent("transcript.delta", { turnId: "u", role: "user", text: "Wie sieht meine Pipeline aus?" })],
      [1800, makeEvent("transcript.final", { turnId: "u", role: "user", text: "Wie sieht meine Pipeline aus?" })],
      [2000, makeEvent("tool.started", { callId: "c1", tool: "list_leads", args: { limit: 10 } })],
      [2110, makeEvent("tool.finished", { callId: "c1", tool: "list_leads", ok: true, summary: "10 Leads geladen", durationMs: 110 })],
      [2150, makeEvent("tool.started", { callId: "c2", tool: "render_widget", args: { dataset: "pipeline_by_month" } })],
      [2300, widget("w")],
      [2400, makeEvent("transcript.delta", { turnId: "a", role: "assistant", text: "Seit Mai" })],
    ]);
    const e = explainTurn(s, 2500);
    expect(e.tiles.map((t) => t.text + (t.accent ?? ""))).toEqual([
      "„Wie sieht meine Pipeline aus?“",
      "Frage nach Umsatzentwicklung",
      "CRM gelesen · 10 Leads geladen, 110 ms",
      "Diagramm + Antwort · 0,6 s",
    ]);
    expect(e.on).toBe(3);
  });

  it("lights the step that is happening now", () => {
    const s = at([[1000, makeEvent("transcript.delta", { turnId: "u", role: "user", text: "Hallo" })]]);
    expect(explainTurn(s, 1100).on).toBe(0);
    expect(explainTurn(initialState, 0).tiles[0].text).toBe("Noch nichts");
  });
});

describe("widgetInsight", () => {
  const months = [
    { label: "2026-08", value: 341000 },
    { label: "2026-09", value: 433000 },
    { label: "2026-10", value: 486000 },
  ];
  it("states the newest value and the change to the previous month, computed from the data", () => {
    const w = at([[1, widget("w", months)]]).widgets[0]!;
    expect(widgetInsight(w)).toEqual({ headline: [{ text: "486.000 €", em: true }, { text: ", plus 12 % zum Vormonat" }], highlight: 2 });
  });

  it("names the leader when the labels are no timeline", () => {
    const w = at([[1, widget("w", [{ label: "neu", value: 3 }, { label: "angebot", value: 7 }], "Leads nach Status")]]).widgets[0]!;
    expect(widgetInsight(w).headline.map((h) => h.text).join("")).toBe("angebot liegt vorn mit 7");
    const map = at([[1, makeEvent("ui.widget", { widgetId: "m", kind: "map", title: "Lead-Radar", data: [{ label: "Köln", lat: 50.9, lng: 6.9, value: 54000 }, { label: "München", lat: 48.1, lng: 11.6, value: 142000 }] })]]).widgets[0]!;
    expect(widgetInsight(map)).toEqual({ headline: [{ text: "München", em: true }, { text: " führt mit 142.000 €" }], highlight: 1 });
  });
});

describe("widget units and gaps (review findings)", () => {
  it("takes the unit from the rendered dataset, not from words in the title", () => {
    const counts = at([[1, widget("w", [{ label: "neu", value: 3 }, { label: "angebot", value: 7 }], "Leads bis Angebot")]]).widgets[0]!;
    expect(widgetInsight(counts, "leads_by_status").headline.map((h) => h.text).join("")).toBe("angebot liegt vorn mit 7");
    const city = at([[1, widget("w", [{ label: "München", value: 142000 }], "Leads nach Stadt")]]).widgets[0]!;
    expect(widgetInsight(city, "leads_by_city").headline.map((h) => h.text).join("")).toBe("München liegt vorn mit 142.000 €");
  });

  it("finds the dataset from the render_widget call that produced the widget", () => {
    const s = at([
      [1000, makeEvent("tool.started", { callId: "c", tool: "render_widget", args: { dataset: "leads_by_status" } })],
      [1100, widget("w", [], "Leads nach Status")],
    ]);
    expect(widgetDataset(s, s.widgets[0]!)).toBe("leads_by_status");
    expect(widgetDataset(at([[1, widget("x")]]), at([[1, widget("x")]]).widgets[0]!)).toBeUndefined();
  });

  it("names the real reference point when the timeline has gaps", () => {
    const days = at([[1, widget("w", [{ label: "2026-10-08", value: 10 }, { label: "2026-10-12", value: 6 }], "Mails nach Tag")]]).widgets[0]!;
    expect(widgetInsight(days).headline.map((h) => h.text).join("")).toBe("6, minus 40 % zum 08.10.");
    const next = at([[1, widget("w", [{ label: "2026-10-11", value: 10 }, { label: "2026-10-12", value: 6 }], "Mails nach Tag")]]).widgets[0]!;
    expect(widgetInsight(next).headline.map((h) => h.text).join("")).toBe("6, minus 40 % zum Vortag");
  });
});

describe("progressStrokes", () => {
  it("caps the strokes and scales the step, so a long task does not look finished early", () => {
    expect(progressStrokes(3, 8)).toEqual({ shown: 8, on: 3 });
    expect(progressStrokes(13, 20)).toEqual({ shown: 12, on: 8 });
    expect(progressStrokes(20, 20)).toEqual({ shown: 12, on: 12 });
    expect(progressStrokes(0, 0)).toEqual({ shown: 0, on: 0 });
  });
});

describe("explain bar for a voice answer", () => {
  it("a spoken 'Ja' to a plan reads as the answer to the approval, not as small talk", () => {
    const s = at([
      [1000, makeEvent("approval.requested", { approvalId: "a1", title: "Plan", detail: "d", risk: "medium" })],
      [2000, makeEvent("transcript.final", { turnId: "u", role: "user", text: "Ja, mach." })],
      [2500, makeEvent("approval.resolved", { approvalId: "a1", approved: true, via: "voice" })],
      [2600, makeEvent("transcript.final", { turnId: "j", role: "assistant", text: "Los geht's." })],
    ]);
    const e = explainTurn(s, 3000);
    expect(e.tiles[1].text).toBe("Antwort auf die Freigabe");
    expect(e.tiles[2].text).toBe("Freigegeben per Stimme");
  });
});

describe("briefing", () => {
  it("the current point is the newest that arrived", () => {
    const s = at([[1, item(0, "3 Termine heute")], [2, item(1, "Müller GmbH ist heiß")], [3, item(2, "Pipeline 486.000 €")]]);
    expect(currentBriefingIndex(s.briefing.items)).toBe(2);
  });
});

describe("focusFacts", () => {
  it("collects only what the conversation already said about the entity", () => {
    const s = at([[1, item(0, "2 dringende Mails", { detail: "Dr. Weber wartet auf das Angebot" })], [2, item(1, "3 Termine heute")]]);
    expect(focusFacts(s, { label: "Dr. Weber – Angebot?", entityId: "M-003" })).toEqual(["2 dringende Mails. Dr. Weber wartet auf das Angebot"]);
    expect(focusFacts(s, { label: "Schulz AG", entityId: "L-9" })).toEqual([]);
  });
});

describe("cuCaption", () => {
  it("narrates in the third person and highlights the key value", () => {
    expect(cuCaption("Wähle 10:00 Uhr")).toEqual([{ text: "Wählt " }, { text: "10:00 Uhr", em: true }]);
    expect(cuCaption("Klicke auf „Neuer Termin“")).toEqual([{ text: "Klickt auf " }, { text: "Neuer Termin", em: true }]);
    expect(cuCaption("Suche Dr. Anna Weber", "Anna Weber")).toEqual([{ text: "Sucht Dr. " }, { text: "Anna Weber", em: true }]);
    expect(cuCaption("Prüfe den Bildschirm")).toEqual([{ text: "Prüft den Bildschirm" }]);
  });
});

describe("speaker line", () => {
  it("shows the newest turn with the words spoken so far and fades after a while", () => {
    const s = at([
      [2000, makeEvent("transcript.final", { turnId: "a1", role: "assistant", text: "Drei Termine und zwei Mails.", words: [
        { word: "Drei", startMs: 0, endMs: 300 }, { word: "Termine", startMs: 300, endMs: 600 }, { word: "und", startMs: 600, endMs: 800 },
        { word: "zwei", startMs: 800, endMs: 1000 }, { word: "Mails.", startMs: 1000, endMs: 1300 } ] })],
    ]);
    expect(subtitleLine(s.turns.at(-1), 2400)).toEqual({ turnId: "a1", role: "assistant", spoken: "Drei Termine", rest: " und zwei Mails." });
    expect(subtitleLine(s.turns.at(-1), 2000 + 1300 + SUBTITLE_HOLD_MS + 1)).toBeNull();
  });

  it("returns Leo's question while Jarvis answers it", () => {
    const s = at([
      [1000, makeEvent("transcript.final", { turnId: "u1", role: "user", text: "Was steht heute an?" })],
      [2000, makeEvent("transcript.delta", { turnId: "a1", role: "assistant", text: "Drei Termine" })],
    ]);
    expect(priorUserLine(s.turns, 2500)).toBe("Was steht heute an?");
    expect(priorUserLine(s.turns.slice(0, 1), 1500)).toBeNull();
  });

  it("greets by time of day", () => {
    expect(greeting(new Date(2026, 9, 12, 8))).toBe("Guten Morgen, Leo.");
    expect(greeting(new Date(2026, 9, 12, 20))).toBe("Guten Abend, Leo.");
  });
});

describe("call helpers", () => {
  it("masks numbers, leaves names alone and quotes the latest call sentence", () => {
    expect(maskNumber("+49 30 23125678")).toBe("+49 ••• •••••78");
    expect(maskNumber("Leo")).toBeNull();
    const s = at([
      [1000, makeEvent("call.state", { callId: "p", status: "connected", to: "Leo" })],
      [1500, makeEvent("transcript.delta", { turnId: "a", role: "assistant", text: "Hallo Leo" })],
    ]);
    expect(callSentence(s)).toBe("Hallo Leo");
  });

  it("shortens ISO months on chart axes", () => {
    expect(axisLabel("2026-10")).toBe("Okt");
    expect(axisLabel("2026-10-09")).toBe("09.10.");
    expect(axisLabel("Hamburg-Nord")).toBe("Hamburg-Nord");
  });
});
