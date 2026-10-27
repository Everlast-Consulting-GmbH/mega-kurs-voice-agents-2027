import type { JarvisEventType, PayloadOf } from "@jarvis/contracts";

// A scenario is a timeline of events. `at` is ms since scenario start.
// `waitFor` pauses the timeline until the HUD sends a matching client event
// (or `timeoutMs` passes), so interactive moments like approvals can be rehearsed.
export type Step =
  | { at: number; type: JarvisEventType; payload: PayloadOf<JarvisEventType> }
  | { at: number; waitFor: "approval.resolved"; timeoutMs: number };

const s = <T extends JarvisEventType>(at: number, type: T, payload: PayloadOf<T>): Step => ({ at, type, payload });

/** Splits a sentence into transcript.delta chunks and a final, spread over durationMs. */
function speak(at: number, turnId: string, role: "user" | "assistant", text: string, durationMs: number): Step[] {
  const words = text.split(" ");
  const per = durationMs / words.length;
  const steps: Step[] = words.map((w, i) =>
    s(Math.round(at + i * per), "transcript.delta", { turnId, role, text: (i ? " " : "") + w }),
  );
  steps.push(
    s(at + durationMs, "transcript.final", {
      turnId,
      role,
      text,
      words: words.map((word, i) => ({ word, startMs: Math.round(i * per), endMs: Math.round((i + 1) * per) })),
    }),
  );
  return steps;
}

function shift(steps: Step[], by: number): Step[] {
  return steps.map((st) => ({ ...st, at: st.at + by }));
}

const bootBriefing: Step[] = [
  s(0, "voice.state", { state: "idle" }),
  s(1500, "voice.state", { state: "speaking" }),
  ...speak(1500, "t0", "assistant", "Guten Morgen. Alle Systeme sind online.", 2200),
  s(3900, "voice.state", { state: "listening" }),
  ...speak(4500, "t1", "user", "Jarvis, was ist heute wichtig?", 1600),
  s(6200, "voice.state", { state: "thinking" }),
  s(6300, "tool.started", { callId: "c-brief", tool: "get_briefing", args: {} }),
  s(6390, "tool.finished", { callId: "c-brief", tool: "get_briefing", ok: true, summary: "5 Punkte im Briefing", durationMs: 90 }),
  s(6700, "metrics.latency", { turnId: "t2", firstAudioMs: 610 }),
  s(6800, "voice.state", { state: "speaking" }),
  ...speak(6800, "t2", "assistant", "Drei Termine, zwei dringende Mails und ein heißer Lead. Der Reihe nach.", 3600),
  s(7600, "briefing.item", { index: 0, total: 5, icon: "calendar", title: "3 Termine heute", detail: "Erster um 10:00 mit der Müller GmbH", metric: { label: "Termine", value: 3 } }),
  s(8800, "briefing.item", { index: 1, total: 5, icon: "mail", title: "2 dringende Mails", detail: "Dr. Weber wartet auf das Angebot", metric: { label: "Ungelesen", value: 14 } }),
  s(9000, "ui.focus", { entity: "mail", entityId: "M-003", label: "Dr. Weber – Angebot?" }),
  s(10000, "briefing.item", { index: 2, total: 5, icon: "lead", title: "Müller GmbH ist heiß", detail: "Score 92, Angebot seit 3 Tagen offen", metric: { label: "Score", value: 92 } }),
  s(10200, "ui.focus", { entity: "lead", entityId: "L-007", label: "Müller GmbH" }),
  s(11200, "briefing.item", { index: 3, total: 5, icon: "money", title: "Pipeline 486.000 €", detail: "+12 % gegenüber Vormonat", metric: { label: "Pipeline", value: 486000, unit: "€" } }),
  s(12400, "briefing.item", { index: 4, total: 5, icon: "weather", title: "14 °C, leichter Regen", detail: "Schirm für den Termin um 15:00", metric: { label: "Temperatur", value: 14, unit: "°C" } }),
  s(13600, "voice.state", { state: "listening" }),
];

const leadsWidget: Step[] = [
  s(0, "voice.state", { state: "listening" }),
  ...speak(300, "t3", "user", "Wie sieht meine Pipeline aus?", 1500),
  s(1900, "voice.state", { state: "thinking" }),
  s(2000, "tool.started", { callId: "c-leads", tool: "list_leads", args: { limit: 10 } }),
  s(2110, "tool.finished", { callId: "c-leads", tool: "list_leads", ok: true, summary: "10 Leads geladen", durationMs: 110 }),
  s(2150, "tool.started", { callId: "c-w1", tool: "render_widget", args: { dataset: "pipeline_by_month" } }),
  s(2230, "tool.finished", { callId: "c-w1", tool: "render_widget", ok: true, summary: "Diagramm Pipeline nach Monat", durationMs: 80 }),
  s(2300, "ui.widget", {
    widgetId: "w-pipeline",
    kind: "bar_chart",
    title: "Pipeline nach Monat",
    data: [
      { label: "Mai", value: 210000 },
      { label: "Jun", value: 265000 },
      { label: "Jul", value: 298000 },
      { label: "Aug", value: 341000 },
      { label: "Sep", value: 433000 },
      { label: "Okt", value: 486000 },
    ],
  }),
  s(2500, "voice.state", { state: "speaking" }),
  ...speak(2500, "t4", "assistant", "Seit Mai stetig nach oben. Die größten Chancen liegen in München und Hamburg.", 4200),
  s(4600, "tool.started", { callId: "c-w2", tool: "render_widget", args: { dataset: "leads_by_city", kind: "map" } }),
  s(4680, "tool.finished", { callId: "c-w2", tool: "render_widget", ok: true, summary: "Lead-Radar", durationMs: 80 }),
  s(4700, "ui.widget", {
    widgetId: "w-radar",
    kind: "map",
    title: "Lead-Radar",
    data: [
      { label: "München", lat: 48.137, lng: 11.575, value: 142000 },
      { label: "Hamburg", lat: 53.551, lng: 9.993, value: 118000 },
      { label: "Berlin", lat: 52.52, lng: 13.405, value: 76000 },
      { label: "Köln", lat: 50.937, lng: 6.96, value: 54000 },
      { label: "Stuttgart", lat: 48.775, lng: 9.182, value: 61000 },
    ],
  }),
  s(5400, "ui.focus", { entity: "lead", entityId: "L-007", label: "Müller GmbH" }),
  s(6900, "voice.state", { state: "listening" }),
];

const CU_STEPS: Array<{ caption: string; action: "click" | "type" | "key"; x: number; y: number; text?: string }> = [
  { caption: "Öffne die Praxis-App", action: "click", x: 120, y: 60 },
  { caption: "Klicke auf 'Patienten'", action: "click", x: 110, y: 180 },
  { caption: "Suche nach 'Weber'", action: "type", x: 640, y: 130, text: "Weber" },
  { caption: "Öffne Patientenakte Dr. Weber", action: "click", x: 520, y: 240 },
  { caption: "Klicke auf 'Neuer Termin'", action: "click", x: 1100, y: 140 },
  { caption: "Wähle Dienstag, 14.10., 10:00", action: "click", x: 760, y: 420 },
  { caption: "Trage Grund ein: Erstgespräch", action: "type", x: 640, y: 520, text: "Erstgespräch" },
  { caption: "Klicke auf 'Termin speichern'", action: "click", x: 980, y: 680 },
];

function computerUse(taskId: string): Step[] {
  const steps: Step[] = [
    s(0, "voice.state", { state: "listening" }),
    ...speak(300, "t5", "user", "Trag Dr. Weber für Dienstag zehn Uhr in der Praxis-App ein.", 2400),
    s(2800, "voice.state", { state: "thinking" }),
    s(2900, "tool.started", { callId: "c-cu", tool: "start_computer_task", args: { instruction: "Termin Dr. Weber Di 10:00" } }),
    s(2960, "tool.finished", { callId: "c-cu", tool: "start_computer_task", ok: true, summary: "Aufgabe gestartet", durationMs: 60 }),
    s(3000, "task.created", { taskId, title: "Termin für Dr. Weber eintragen", kind: "computer_use" }),
    s(3050, "cu.mode", { taskId, mode: "pixel", vncUrl: "http://localhost:6080/vnc.html" }),
    s(3100, "voice.state", { state: "acting" }),
    ...speak(3100, "t6", "assistant", "Ich übernehme. Du kannst mir währenddessen weiter Fragen stellen.", 3000),
  ];
  CU_STEPS.forEach((st, i) => {
    const at = 3600 + i * 2200;
    steps.push(s(at, "cu.frame", { taskId, imageUrl: `/frames/${i}.svg`, width: 1280, height: 800 }));
    steps.push(
      s(at + 700, "cu.action", {
        taskId,
        action: st.action,
        x: st.x,
        y: st.y,
        target: { x: st.x - 70, y: st.y - 22, width: 140, height: 44 },
        caption: st.caption,
        step: i + 1,
        totalSteps: CU_STEPS.length,
        ...(st.text ? { text: st.text } : {}),
      }),
    );
    steps.push(s(at + 800, "task.progress", { taskId, message: st.caption, step: i + 1, totalSteps: CU_STEPS.length }));
  });
  const end = 3600 + CU_STEPS.length * 2200;
  steps.push(
    s(end, "cu.frame", { taskId, imageUrl: `/frames/${CU_STEPS.length}.svg`, width: 1280, height: 800 }),
    s(end + 400, "task.done", { taskId, result: "Termin am Dienstag, 14.10., 10:00 für Dr. Weber eingetragen" }),
    s(end + 500, "ui.focus", { entity: "appointment", entityId: "A-101", label: "Di 14.10. 10:00 – Dr. Weber" }),
    s(end + 600, "voice.state", { state: "speaking" }),
    ...speak(end + 600, "t7", "assistant", "Erledigt. Dr. Weber steht am Dienstag um zehn im Kalender.", 2600),
    s(end + 3300, "voice.state", { state: "listening" }),
  );
  return steps;
}

const approvalCall: Step[] = [
  // Like the orchestrator's /demo/notice/urgent-mail: the stage turns warm before Jarvis interrupts
  s(0, "notice", { noticeId: "n-weber", severity: "urgent", title: "Dringende Mail von Dr. Anna Weber", detail: "Bitte bestätigen Sie meinen Termin am Dienstag, 14.10., um 10:00.", entity: "mail", entityId: "M-009" }),
  s(0, "voice.state", { state: "speaking" }),
  ...speak(0, "t8", "assistant", "Entschuldigung, gerade kam eine dringende Mail von Dr. Weber. Soll ich die Terminbestätigung schicken?", 4200),
  s(800, "ui.focus", { entity: "mail", entityId: "M-009", label: "Dr. Weber – Dringend" }),
  s(4300, "approval.requested", { approvalId: "a-mail", title: "Mail an Dr. Weber senden", detail: "Betreff: Ihr Termin am Dienstag, 14.10., 10:00", risk: "medium" }),
  s(4400, "voice.state", { state: "listening" }),
  { at: 4500, waitFor: "approval.resolved", timeoutMs: 8000 },
  s(4600, "tool.started", { callId: "c-mail", tool: "send_email", args: { to: "weber@praxis-weber.example" } }),
  s(4900, "tool.finished", { callId: "c-mail", tool: "send_email", ok: true, summary: "Mail an Dr. Weber gesendet", durationMs: 300 }),
  s(5000, "voice.state", { state: "speaking" }),
  ...speak(5000, "t9", "assistant", "Gesendet. Ich rufe dich an, sobald das Angebot fertig ist.", 2600),
  s(7800, "tool.started", { callId: "c-call", tool: "place_call", args: { to: "me", purpose: "Angebot fertig" } }),
  s(7900, "tool.finished", { callId: "c-call", tool: "place_call", ok: true, summary: "Anruf gestartet", durationMs: 100 }),
  s(8000, "call.state", { callId: "p-1", status: "dialing", to: "Leo" }),
  s(9500, "call.state", { callId: "p-1", status: "ringing", to: "Leo" }),
  s(13000, "call.state", { callId: "p-1", status: "connected", to: "Leo", durationMs: 0 }),
  ...speak(13300, "t10", "assistant", "Hallo, hier ist Jarvis. Das Angebot für die Müller GmbH liegt in deinem Postfach.", 3800),
  ...speak(17400, "t11", "user", "Danke, schick es raus.", 1200),
  s(19000, "call.state", { callId: "p-1", status: "ended", to: "Leo", durationMs: 6000 }),
  s(19100, "voice.state", { state: "idle" }),
];

const toolLearned: Step[] = [
  s(0, "task.created", { taskId: "k-learn", title: "Praxis-App anbinden", kind: "research" }),
  s(600, "task.progress", { taskId: "k-learn", message: "Zeichne Netzwerkverkehr auf", step: 1, totalSteps: 3 }),
  s(2600, "task.progress", { taskId: "k-learn", message: "Erkenne Endpunkte", step: 2, totalSteps: 3 }),
  s(4200, "tool.learned", {
    tool: "praxis_book_appointment",
    description: "Termin in der Praxis-App buchen",
    endpoints: [
      { method: "GET", path: "/praxis/api/patients?q=" },
      { method: "GET", path: "/praxis/api/slots?date=" },
      { method: "POST", path: "/praxis/api/appointments" },
    ],
  }),
  s(4300, "task.done", { taskId: "k-learn", result: "Neues Tool praxis_book_appointment verfügbar" }),
];

// ---- Drehbuch "Ein Morgen mit Jarvis" (demo/BEISPIEL-ABLAUF.md) ----------------------------------
// Same ids as the HUD's demo data (apps/hud/lib/apps/fixtures.ts): M-101 Müller's mail,
// L-001 Müller GmbH, today's calendar, channel #vertrieb.

const todayAt = (hh: number, mm = 0) => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

/** Scene 1: calendar, mail and CRM fan out; Müller's mail arrives as a notification midway. */
const briefingApps: Step[] = [
  s(0, "voice.state", { state: "listening" }),
  ...speak(200, "b1", "user", "Jarvis, was ist heute wichtig?", 1500),
  s(1800, "voice.state", { state: "thinking" }),
  s(1850, "tool.started", { callId: "c-brief2", tool: "get_briefing", args: {} }),
  s(1940, "tool.finished", { callId: "c-brief2", tool: "get_briefing", ok: true, summary: "3 Punkte im Briefing", durationMs: 90 }),
  s(2200, "metrics.latency", { turnId: "b2", firstAudioMs: 640 }),
  s(2300, "voice.state", { state: "speaking" }),
  ...speak(2300, "b2", "assistant", "Guten Morgen, Leo. Drei Termine, zwei dringende Mails, und Müller will heute unterschreiben.", 6200),
  s(2600, "briefing.item", { index: 0, total: 3, icon: "calendar", title: "3 Termine heute", detail: "Team-Standup um 09:30, Dr. Weber um 11:00", metric: { label: "Termine", value: 3 } }),
  s(4400, "briefing.item", { index: 1, total: 3, icon: "mail", title: "2 dringende Mails", detail: "Thomas Müller und Dr. Anna Weber", metric: { label: "Dringend", value: 2 } }),
  s(5600, "notice", { noticeId: "n-mueller", severity: "urgent", title: "Thomas Müller", detail: "Unterschrift heute möglich?", entity: "mail", entityId: "M-101" }),
  s(6600, "briefing.item", { index: 2, total: 3, icon: "lead", title: "Müller GmbH will unterschreiben", detail: "84.000 €, Score 92, Phase Angebot", metric: { label: "Wert", value: 84000, unit: "€" } }),
  s(8600, "voice.state", { state: "listening" }),
];

const RUN = "r-mueller";
const MAIL_TEXT = "Hallo Herr Müller,\nsehr gern, 15 Uhr passt. Die Einladung kommt gleich. Bis nachher!\nViele Grüße, Leo";
const CHAT_TEXT = "🎉 Müller GmbH will heute 15 Uhr unterschreiben (84.000 €). Termin steht, Einladung ist raus.";

/** Scene 2, the climax: plan, one "Ja", four agents at once, the punchline. */
const multiAgent: Step[] = [
  s(0, "voice.state", { state: "listening" }),
  ...speak(200, "m1", "user", "Kümmer dich um die Müller GmbH.", 1500),
  s(1800, "voice.state", { state: "thinking" }),
  s(1850, "tool.started", { callId: "c-handle", tool: "handle_request", args: { instruction: "Kümmer dich um die Müller GmbH" } }),
  s(1950, "tool.finished", { callId: "c-handle", tool: "handle_request", ok: true, summary: "Plan mit 4 Schritten", durationMs: 100 }),
  s(2300, "run.planned", {
    runId: RUN,
    title: "Müller GmbH: Unterschrift heute vorbereiten",
    approvalId: "a-run-mueller",
    steps: [
      { agentId: "ag-mail", app: "mail", summary: "Herrn Müller zusagen: heute 15 Uhr" },
      { agentId: "ag-cal", app: "calendar", summary: "Termin 15:00 „Unterschrift Müller GmbH“ anlegen" },
      { agentId: "ag-chat", app: "chat", summary: "#vertrieb Bescheid geben" },
      { agentId: "ag-crm", app: "crm", summary: "Deal auf „Verhandlung“ schieben" },
    ],
  }),
  s(2400, "voice.state", { state: "speaking" }),
  ...speak(2400, "m2", "assistant", "Mein Plan: Ich sage Herrn Müller für fünfzehn Uhr zu, trage den Termin ein, gebe dem Vertrieb Bescheid und schiebe den Deal auf Verhandlung. Soll ich?", 5600),
  s(8100, "voice.state", { state: "listening" }),
  { at: 8200, waitFor: "approval.resolved", timeoutMs: 4000 },
  // without a click the rehearsal says "Ja" (a click before resolves it first; the echo is then ignored)
  ...speak(8300, "m3", "user", "Ja, mach.", 700),
  s(9100, "approval.resolved", { approvalId: "a-run-mueller", approved: true, via: "voice" }),
  s(9300, "voice.state", { state: "acting" }),
  ...speak(9300, "m4", "assistant", "Ich bestätige den Termin, sag dem Team Bescheid und schiebe den Deal auf Verhandlung.", 3800),
  ...(
    [
      ["ag-mail", "mail", "Mail · schreibt"],
      ["ag-cal", "calendar", "Kalender · plant"],
      ["ag-chat", "chat", "Slack · informiert"],
      ["ag-crm", "crm", "CRM · aktualisiert"],
    ] as const
  ).map(([agentId, app, label], i) => s(9400 + i * 120, "agent.spawned", { runId: RUN, agentId, app, label })),
  // mail: open, pick Müller's mail, type the answer, send
  s(9600, "agent.action", { runId: RUN, agentId: "ag-mail", app: "mail", action: "open", caption: "Öffnet den Posteingang" }),
  s(10300, "agent.action", { runId: RUN, agentId: "ag-mail", app: "mail", action: "select", entityId: "M-101", caption: "Öffnet die Mail von Thomas Müller" }),
  s(11100, "agent.action", { runId: RUN, agentId: "ag-mail", app: "mail", action: "type", entityId: "M-101", field: "body", text: MAIL_TEXT, caption: "Schreibt die Antwort" }),
  s(14700, "agent.action", { runId: RUN, agentId: "ag-mail", app: "mail", action: "send", entityId: "M-101", caption: "Sendet die Antwort" }),
  s(15500, "agent.finished", { runId: RUN, agentId: "ag-mail", ok: true, summary: "Antwort an Thomas Müller gesendet" }),
  // calendar: open, pick the 15:00 slot, type the title, create
  s(9700, "agent.action", { runId: RUN, agentId: "ag-cal", app: "calendar", action: "open", caption: "Öffnet den Kalender" }),
  s(10500, "agent.action", { runId: RUN, agentId: "ag-cal", app: "calendar", action: "select", to: todayAt(15), caption: "Wählt heute 15:00" }),
  s(11400, "agent.action", { runId: RUN, agentId: "ag-cal", app: "calendar", action: "type", field: "title", text: "Unterschrift Müller GmbH", caption: "Trägt den Titel ein" }),
  s(12900, "agent.action", { runId: RUN, agentId: "ag-cal", app: "calendar", action: "create", entityId: "E-301", caption: "Legt den Termin an" }),
  s(13700, "agent.finished", { runId: RUN, agentId: "ag-cal", ok: true, summary: "Termin heute 15:00 angelegt" }),
  // chat: open #vertrieb, type, send
  s(9800, "agent.action", { runId: RUN, agentId: "ag-chat", app: "chat", action: "open", entityId: "vertrieb", caption: "Öffnet Slack" }),
  s(10600, "agent.action", { runId: RUN, agentId: "ag-chat", app: "chat", action: "select", entityId: "vertrieb", caption: "Wechselt in #vertrieb" }),
  s(11600, "agent.action", { runId: RUN, agentId: "ag-chat", app: "chat", action: "type", text: CHAT_TEXT, caption: "Schreibt an das Team" }),
  s(15100, "agent.action", { runId: RUN, agentId: "ag-chat", app: "chat", action: "send", entityId: "C-399", caption: "Sendet die Nachricht" }),
  s(15900, "agent.finished", { runId: RUN, agentId: "ag-chat", ok: true, summary: "#vertrieb informiert" }),
  // crm: open, pick the deal, drag it to "Verhandlung"
  s(9900, "agent.action", { runId: RUN, agentId: "ag-crm", app: "crm", action: "open", caption: "Öffnet die Pipeline" }),
  s(10800, "agent.action", { runId: RUN, agentId: "ag-crm", app: "crm", action: "select", entityId: "L-001", caption: "Wählt den Deal Müller GmbH" }),
  s(11900, "agent.action", { runId: RUN, agentId: "ag-crm", app: "crm", action: "move", entityId: "L-001", from: "angebot", to: "verhandlung", caption: "Schiebt den Deal auf Verhandlung" }),
  s(13600, "agent.finished", { runId: RUN, agentId: "ag-crm", ok: true, summary: "Deal Müller GmbH in Verhandlung" }),
  s(16500, "run.summary", { runId: RUN, title: "Müller GmbH: Unterschrift heute vorbereiten", tasks: 4, durationMs: 11_000, humanMinutes: 14 }),
  s(17200, "voice.state", { state: "speaking" }),
  ...speak(17200, "m5", "assistant", "Erledigt. Vier Aufgaben in elf Sekunden, von Hand wären das etwa vierzehn Minuten gewesen.", 4200),
  s(21600, "voice.state", { state: "listening" }),
];

function concat(...parts: Step[][]): Step[] {
  const out: Step[] = [];
  let offset = 0;
  for (const p of parts) {
    out.push(...shift(p, offset));
    offset += Math.max(...p.map((st) => st.at)) + 1500;
  }
  return out;
}

export const SCENARIOS: Record<string, Step[]> = {
  "boot-briefing": bootBriefing,
  "leads-widget": leadsWidget,
  "computer-use": computerUse("k-cu"),
  "approval-call": approvalCall,
  "tool-learned": toolLearned,
};
SCENARIOS["full-demo"] = concat(bootBriefing, leadsWidget, computerUse("k-cu"), approvalCall);
SCENARIOS["briefing-apps"] = briefingApps;
SCENARIOS["multi-agent"] = multiAgent;
// The whole Drehbuch in order: briefing with notice, the four agents, the pipeline, computer use.
SCENARIOS["drehbuch"] = concat(briefingApps, multiAgent, leadsWidget, computerUse("k-cu2"));
