import type { Approval, BriefingItem, Focus, HudState, LearnedTool, ToolCall, Turn, Widget } from "@/lib/events/reducer";
import { activeApproval, activeNotice, callVisible, cuPhase, focusVisible, TIMING } from "@/lib/derived";
import { activeWordIndex, splitWords } from "@/lib/transcript";
import type { ConnectionStatus } from "@/lib/events/client";
import { toPoints, toRows, toSeries, toStat } from "@/lib/widgetData";
import { runPhase } from "@/lib/agents";
import { DEMO_USER } from "@/lib/apps/fixtures";

// Pure side of the "speaker + stage" layout: what the one
// stage shows, where Jarvis stands, the live status line and the explain bar. Everything is a
// function of (state, now) so components agree and tests need no DOM.

// ---- what owns the stage --------------------------------------------------------------

/** A stage closes this long after its last new reference (briefing item, widget, ...). */
export const STAGE_HOLD_MS = 12_000;

export type StageItem =
  | { kind: "approval"; key: string; at: number; approval: Approval }
  | { kind: "run"; key: string; at: number; phase: "work" | "summary" }
  | { kind: "cu"; key: string; at: number; phase: "takeover" | "done" }
  | { kind: "learned"; key: string; at: number; learned: LearnedTool }
  | { kind: "widget"; key: string; at: number; widget: Widget }
  | { kind: "briefing"; key: string; at: number }
  | { kind: "focus"; key: string; at: number; focus: Focus };

// Freigabe > Agenten-Lauf > Computer Use > Tool gelernt > Widget > Briefing > Fokus.
// Notices never take the stage: they arrive as a macOS-style notification (Bild C).
const PRIO: Record<StageItem["kind"], number> = { approval: 6, run: 5, cu: 4, learned: 3.5, widget: 3, briefing: 2, focus: 1 };

/** Start times of everything that ever claimed the stage, live or not (for "replaced by newer"). */
function claims(s: HudState): Array<{ kind: StageItem["kind"]; at: number }> {
  const out: Array<{ kind: StageItem["kind"]; at: number }> = [];
  for (const id of s.approvalOrder) out.push({ kind: "approval", at: s.approvals[id]!.requestedAt });
  if (s.run && s.run.agentOrder.length) out.push({ kind: "run", at: s.run.startedAt });
  for (const id of s.taskOrder) if (s.tasks[id]!.kind === "computer_use") out.push({ kind: "cu", at: s.tasks[id]!.createdAt });
  for (const l of s.learned) out.push({ kind: "learned", at: l.at });
  for (const w of s.widgets) out.push({ kind: "widget", at: w.at });
  const last = lastBriefingAt(s);
  if (last !== null) out.push({ kind: "briefing", at: last });
  if (s.focus) out.push({ kind: "focus", at: s.focus.at });
  return out;
}

const lastBriefingAt = (s: HudState) => (s.briefing.items.length ? s.briefing.items.reduce((m, i) => Math.max(m, i.at), -Infinity) : null);

/** Every candidate that is live right now, unordered. */
function candidates(s: HudState, now: number, dismissed: ReadonlySet<string>): StageItem[] {
  const out: StageItem[] = [];
  // A plan that was approved stays up ("Freigegeben") until its agents start, then gives way at once.
  const planAnswer = s.run?.approvalId ? s.approvals[s.run.approvalId] : undefined;
  const waitingForAgents = planAnswer?.status === "approved" && s.run!.agentOrder.length === 0 && runPhase(s, now) === "plan";
  const a = activeApproval(s, now) ?? (waitingForAgents ? planAnswer : null);
  const planStarted = !!a && a.status !== "pending" && s.run?.approvalId === a.approvalId && s.run.agentOrder.length > 0;
  if (a && !planStarted) out.push({ kind: "approval", key: `approval-${a.approvalId}`, at: a.requestedAt, approval: a });
  const rp = runPhase(s, now);
  if (s.run && (rp === "work" || rp === "summary")) out.push({ kind: "run", key: `run-${s.run.runId}-${rp}`, at: s.run.startedAt, phase: rp });
  const phase = cuPhase(s, now);
  if (phase === "takeover" || phase === "done") {
    const t = s.cu.taskId ? s.tasks[s.cu.taskId] : undefined;
    out.push({ kind: "cu", key: `cu-${s.cu.taskId}`, at: t?.createdAt ?? s.cu.frame?.at ?? now, phase });
  }
  const l = s.learned[0];
  if (l && now - l.at < STAGE_HOLD_MS) out.push({ kind: "learned", key: `learned-${l.tool}`, at: l.at, learned: l });
  const w = s.widgets[0];
  if (w && now - w.at < STAGE_HOLD_MS) out.push({ kind: "widget", key: `widget-${w.widgetId}`, at: w.at, widget: w });
  const b = lastBriefingAt(s);
  if (b !== null && now - b < STAGE_HOLD_MS) out.push({ kind: "briefing", key: `briefing-${s.briefing.startedAt}`, at: b });
  const f = s.focus;
  if (f && focusVisible(s, now)) out.push({ kind: "focus", key: `focus-${f.entity}-${f.entityId}-${f.seq}`, at: f.at, focus: f });
  return out;
}

/**
 * The one thing on stage. Higher priority wins; an item that a newer item of equal or higher
 * priority has replaced never comes back (no flashing back to an old briefing or notice).
 * State-driven items are never replaced for good: a pending approval needs an answer, and the
 * agent window returns while the agent still works.
 */
export function stageItem(s: HudState, now: number, dismissed: ReadonlySet<string> = new Set()): StageItem | null {
  const all = claims(s);
  const sticky = (c: StageItem) => c.kind === "cu" || c.kind === "run" || (c.kind === "approval" && c.approval.status === "pending");
  const live = candidates(s, now, dismissed).filter((c) => sticky(c) || !all.some((o) => o.at > c.at && PRIO[o.kind] >= PRIO[c.kind] && o.kind !== c.kind));
  live.sort((x, y) => PRIO[y.kind] - PRIO[x.kind] || y.at - x.at);
  return live[0] ?? null;
}

export type Mode = "calm" | "stage" | "cu" | "call" | "agents" | "summary" | "desk";

/**
 * Where Jarvis stands: alone (A), beside the stage (B), beside the agent window (C), on the
 * phone (D); with the agents' app windows (agents, Bild A), over the result (summary, Bild B)
 * or under the fanned-out apps of the briefing (desk, Bild C).
 */
export function stageMode(s: HudState, now: number, dismissed?: ReadonlySet<string>): Mode {
  const item = stageItem(s, now, dismissed);
  // the call hides everything, except an approval it asks for itself (otherwise nobody could answer it)
  const askedInCall = item?.kind === "approval" && item.approval.status === "pending" && !!s.call && item.at >= s.call.since;
  if (liveCall(s, now) && !askedInCall) return "call";
  if (!item) return "calm";
  if (item.kind === "run") return item.phase === "summary" ? "summary" : "agents";
  if (item.kind === "briefing") return "desk";
  return item.kind === "cu" ? "cu" : "stage";
}

export type LiveCall = "dialing" | "ringing" | "connected" | "ended" | "failed";

/** The call owns the whole screen while it runs and a few seconds after it ended. */
export function liveCall(s: HudState, now: number): LiveCall | null {
  return callVisible(s, now) && s.call ? s.call.status : null;
}

// ---- the speaker's line -----------------------------------------------------------------

export const SUBTITLE_HOLD_MS = 6000;

export type SubtitleLine = { turnId: string; role: "user" | "assistant"; spoken: string; rest: string };

/** The one subtitle line: the newest turn, split into spoken words and words still to come. */
export function subtitleLine(t: Turn | undefined, now: number, holdMs = SUBTITLE_HOLD_MS): SubtitleLine | null {
  if (!t || !t.text.trim()) return null;
  const words = splitWords(t.text);
  const spokenCount = activeWordIndex(t, now);
  const spokenAll = spokenCount >= words.length;
  if (t.final && spokenAll && now - Math.max(t.finalAt ?? t.updatedAt, t.startedAt + (t.words?.at(-1)?.endMs ?? 0)) > holdMs) return null;
  // The word being spoken right now already counts as said.
  const n = t.role === "user" ? words.length : Math.min(words.length, spokenCount + 1);
  const spoken = words.slice(0, n).join(" ");
  const rest = words.slice(n).join(" ");
  return { turnId: t.turnId, role: t.role, spoken, rest: rest ? ` ${rest}` : "" };
}

const PRIOR_USER_MS = 20_000;

/** Leo's last question, shown pale above the line Jarvis is answering it with. */
export function priorUserLine(turns: Turn[], now: number): string | null {
  const last = turns.at(-1);
  if (!last || last.role !== "assistant") return null;
  const user = turns.at(-2);
  if (!user || user.role !== "user" || !user.text.trim() || now - user.updatedAt > PRIOR_USER_MS) return null;
  return user.text;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return `${h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend"}, ${DEMO_USER}.`;
}

// ---- live status line (top right) -------------------------------------------------------

/** What a tool does, as the status line says it ("Liest Kalender, Mails, CRM"). */
const DOING: Record<string, string> = {
  get_briefing: "Liest Kalender, Mails, CRM",
  list_leads: "Liest CRM",
  get_lead: "Liest CRM",
  list_emails: "Liest Mails",
  read_email: "Liest Mails",
  list_events: "Liest Kalender",
  focus_entity: "Sucht heraus",
  render_widget: "Zeichnet Diagramm",
  delegate_task: "Gibt Aufgabe ab",
  start_computer_task: "Übernimmt den Computer",
  send_email: "Sendet Mail",
  create_event: "Legt Termin an",
  place_call: "Startet Anruf",
  resolve_approval: "Prüft Freigabe",
  handle_request: "Plant den Auftrag",
  reply_email: "Beantwortet Mail",
  post_message: "Schreibt ins Team",
  move_deal: "Aktualisiert CRM",
};
const VOICE_STATUS = { idle: null, listening: "Hört zu", thinking: "Denkt nach", speaking: "Spricht", acting: "Arbeitet" } as const;

const TOOL_LINGER_MS = 1500;
export const TOOL_STALE_MS = 30_000;

/** Name of the app the agent drives, from the task title (the mock world's three apps). */
export function appName(title: string | undefined): string {
  const t = title ?? "";
  if (/praxis|patient|termin/i.test(t)) return "PraxisPilot";
  if (/mail|postfach/i.test(t)) return "Jarvis Mail";
  if (/crm|lead|kontakt/i.test(t)) return "Jarvis CRM";
  return "den Computer";
}

/** "Pipeline nach Monat" -> "Pipeline" */
const subject = (title: string) => title.split(/\s+(?:nach|pro|je|im|der|des)\s+/i)[0]!.trim();

export type Status = { text: string; tone: "live" | "warn" };

export function statusLine(s: HudState, conn: ConnectionStatus["state"], now: number, toolCount: number, dismissed?: ReadonlySet<string>): Status {
  if (conn === "reconnecting") return { text: "Verbindung unterbrochen", tone: "warn" };
  if (conn !== "open") return { text: "Verbinde …", tone: "warn" };

  const call = liveCall(s, now);
  if (call) return { text: call === "ended" ? "Anruf beendet" : call === "failed" ? "Anruf fehlgeschlagen" : "Ausgehender Anruf", tone: "live" };

  const item = stageItem(s, now, dismissed);
  if (item?.kind === "approval") {
    const st = item.approval.status;
    return { text: st === "pending" ? "Wartet auf deine Freigabe" : st === "approved" ? "Freigegeben" : "Abgelehnt", tone: "live" };
  }
  if (item?.kind === "run") {
    if (item.phase === "summary") return { text: "Erledigt", tone: "live" };
    const n = s.run?.agentOrder.length ?? 0;
    return { text: `${n} ${n === 1 ? "Agent arbeitet" : "Agenten arbeiten"}`, tone: "live" };
  }
  if (item?.kind === "cu") {
    const t = s.cu.taskId ? s.tasks[s.cu.taskId] : undefined;
    if (item.phase === "done") return { text: t?.status === "failed" ? "Aufgabe fehlgeschlagen" : "Aufgabe erledigt", tone: "live" };
    return { text: `Bedient ${appName(t?.title)}`, tone: "live" };
  }

  // a tool call that is running (or just finished) says most precisely what happens
  for (let i = s.toolOrder.length - 1; i >= 0; i--) {
    const t = s.tools[s.toolOrder[i]!];
    if (!t || t.taskId) continue;
    const running = t.status === "running" && now - t.startedAt < TOOL_STALE_MS;
    if (running || now - (t.finishedAt ?? 0) < TOOL_LINGER_MS) return { text: DOING[t.tool] ?? `Nutzt ${t.tool.replace(/_/g, " ")}`, tone: "live" };
    break;
  }

  if (item?.kind === "briefing") return { text: DOING.get_briefing!, tone: "live" };
  if (item?.kind === "widget") return { text: `Zeigt ${subject(item.widget.title)}`, tone: "live" };
  if (item?.kind === "learned") return { text: "Neues Werkzeug gelernt", tone: "live" };
  if (item?.kind === "focus") return { text: `Zeigt ${item.focus.label}`, tone: "live" };

  const info = activeNotice(s, now, dismissed);
  if (info) return { text: info.severity === "urgent" ? (info.entity === "mail" ? "Dringende Mail" : "Dringender Hinweis") : `Hinweis: ${info.title}`, tone: "live" };

  const bg = s.taskOrder.map((id) => s.tasks[id]!).filter((t) => t.status === "running" && now - t.updatedAt < TIMING.staleMs).at(-1);
  if (bg) return { text: `Arbeitet: ${bg.title}`, tone: "live" };

  const v = VOICE_STATUS[s.voice.state];
  if (v) return { text: v, tone: "live" };
  return { text: `Bereit · ${toolCount + s.learned.length} Werkzeuge`, tone: "live" };
}

// ---- explain bar (key D) ----------------------------------------------------------------

/** What Leo asked for, read from the tools Jarvis chose (never from guessing the text). */
const INTENT: Record<string, string | ((args: Record<string, unknown>) => string)> = {
  get_briefing: "Frage nach dem Tag",
  list_leads: "Frage nach Leads",
  get_lead: "Frage zu einem Lead",
  list_emails: "Frage nach Mails",
  read_email: "Frage nach einer Mail",
  list_events: "Frage nach Terminen",
  focus_entity: (a) => (typeof a.label === "string" ? `Frage zu ${a.label}` : "Frage zu einem Eintrag"),
  render_widget: (a) =>
    ({ pipeline_by_month: "Frage nach Umsatzentwicklung", leads_by_status: "Frage nach Lead-Status", leads_by_city: "Frage nach Regionen", emails_by_day: "Frage nach Mail-Aufkommen" })[
      String(a.dataset)
    ] ?? "Frage nach einem Diagramm",
  delegate_task: "Mehrschrittige Aufgabe",
  start_computer_task: (a) => (typeof a.instruction === "string" ? `Auftrag am Computer: ${a.instruction}` : "Auftrag am Computer"),
  send_email: "Mail senden",
  create_event: "Termin anlegen",
  place_call: "Anruf",
  resolve_approval: "Antwort auf die Freigabe",
  handle_request: (a) => (typeof a.instruction === "string" ? `Auftrag: ${a.instruction}` : "Mehrteiliger Auftrag"),
  reply_email: "Mail beantworten",
  post_message: "Nachricht ans Team",
  move_deal: "Deal verschieben",
};

/** The tool as a plain sentence ("CRM gelesen"). */
const DONE: Record<string, string> = {
  get_briefing: "Briefing erstellt",
  list_leads: "CRM gelesen",
  get_lead: "CRM gelesen",
  list_emails: "Postfach gelesen",
  read_email: "Mail gelesen",
  list_events: "Kalender gelesen",
  focus_entity: "Eintrag herausgesucht",
  render_widget: "Diagramm erstellt",
  delegate_task: "Aufgabe abgegeben",
  start_computer_task: "Computer übernommen",
  send_email: "Mail gesendet",
  create_event: "Termin angelegt",
  place_call: "Anruf gestartet",
  resolve_approval: "Freigabe gemeldet",
  handle_request: "Plan erstellt",
  reply_email: "Mail beantwortet",
  post_message: "Nachricht gepostet",
  move_deal: "Deal verschoben",
};

// Showing something is the side effect, not the data source: prefer the tool that read data.
const PRESENTERS = new Set(["render_widget", "focus_entity"]);

export type ExplainTile = { label: "GEHÖRT" | "VERSTANDEN" | "WERKZEUG" | "ERGEBNIS"; text: string; accent?: string };
export type Explain = { tiles: [ExplainTile, ExplainTile, ExplainTile, ExplainTile]; on: 0 | 1 | 2 | 3 };

const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

function intentOf(tools: ToolCall[]): string | null {
  const widget = tools.find((t) => t.tool === "render_widget");
  const main = widget ?? tools.find((t) => !PRESENTERS.has(t.tool)) ?? tools[0];
  if (!main) return null;
  const i = INTENT[main.tool];
  return typeof i === "function" ? i(main.args) : (i ?? `Werkzeug ${main.tool.replace(/_/g, " ")}`);
}

/** What appeared on screen for this turn (events received after the question). */
function shownSince(s: HudState, since: number): string | null {
  if (s.run && s.run.startedAt >= since && s.run.agentOrder.length) return `${s.run.agentOrder.length} Agenten`;
  if (s.run && s.run.plannedAt !== null && s.run.plannedAt >= since) return "Plan";
  if (s.widgets.some((w) => w.at >= since)) return "Diagramm";
  if (s.briefing.items.some((i) => i.at >= since)) return "Briefing";
  if (s.taskOrder.some((id) => s.tasks[id]!.kind === "computer_use" && s.tasks[id]!.createdAt >= since)) return "Computer-Fenster";
  if (s.approvalOrder.some((id) => s.approvals[id]!.requestedAt >= since)) return "Freigabe";
  if (s.call && s.call.since >= since) return "Anruf";
  if (s.focus && s.focus.at >= since) return "Detailkarte";
  return null;
}

/** The last turn in four plain steps: heard, understood, tool, result. */
export function explainTurn(s: HudState, now: number): Explain {
  let u = -1;
  for (let i = s.turns.length - 1; i >= 0; i--)
    if (s.turns[i]!.role === "user" && s.turns[i]!.text.trim()) {
      u = i;
      break;
    }
  if (u === -1)
    return {
      tiles: [
        { label: "GEHÖRT", text: "Noch nichts" },
        { label: "VERSTANDEN", text: "–" },
        { label: "WERKZEUG", text: "–" },
        { label: "ERGEBNIS", text: "–" },
      ],
      on: 0,
    };
  const user = s.turns[u]!;
  const answer = s.turns.slice(u + 1).find((t) => t.role === "assistant");
  const tools = s.toolOrder.map((id) => s.tools[id]!).filter((t) => t && !t.taskId && t.startedAt >= user.startedAt);
  const main = tools.find((t) => !PRESENTERS.has(t.tool)) ?? tools[0];

  // "Ja" to a plan or approval: the voice answer is the action, even without a tool call
  const answered = s.approvalOrder.map((id) => s.approvals[id]!).find((a) => a.via === "voice" && (a.resolvedAt ?? 0) >= user.startedAt);
  const intent = intentOf(tools) ?? (answered ? "Antwort auf die Freigabe" : answer ? "Gespräch, kein Werkzeug nötig" : "…");
  let tool: ExplainTile = { label: "WERKZEUG", text: answered && !main ? `${answered.status === "approved" ? "Freigegeben" : "Abgelehnt"} per Stimme` : answer && !main ? "Keins" : "…" };
  if (main) {
    const name = DONE[main.tool] ?? main.tool.replace(/_/g, " ");
    tool =
      main.status === "running"
        ? { label: "WERKZEUG", text: `${name.replace(/ \S+$/, "")} …` }
        : { label: "WERKZEUG", text: `${main.status === "error" ? "Fehler" : name} · `, accent: `${main.summary ?? ""}${main.durationMs !== undefined ? `, ${Math.round(main.durationMs)} ms` : ""}` };
  }
  const shown = shownSince(s, user.startedAt);
  const heardAt = user.finalAt ?? user.updatedAt;
  const result: ExplainTile = answer
    ? { label: "ERGEBNIS", text: `${shown ? `${shown} + Antwort` : "Antwort"} · `, accent: seconds(answer.startedAt - heardAt) }
    : { label: "ERGEBNIS", text: shown ?? "…" };

  const on: Explain["on"] = answer ? 3 : tools.length ? 2 : user.final ? 1 : 0;
  return {
    tiles: [{ label: "GEHÖRT", text: `„${user.text.trim()}“` }, { label: "VERSTANDEN", text: intent }, tool, result],
    on,
  };
}

// ---- stage contents -----------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Chart axis label: ISO months/days become short German labels, anything else stays as sent. */
export function axisLabel(label: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (month) return MONTHS[Number(month[2]) - 1] ?? label;
  const day = /^\d{4}-(\d{2})-(\d{2})$/.exec(label);
  if (day) return `${day[2]}.${day[1]}.`;
  return label;
}

const isMonth = (l: string) => /^\d{4}-\d{2}$/.test(l) || MONTHS.includes(l);
const isDay = (l: string) => /^\d{4}-\d{2}-\d{2}$/.test(l);

/** Whether `b` directly follows `a` (ISO month or day; short month names count as adjacent in order). */
function adjacent(a: string, b: string): boolean {
  if (isDay(a) && isDay(b)) return Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`) === 86_400_000;
  const m = (l: string) => (/^(\d{4})-(\d{2})$/.exec(l) ? Number(l.slice(0, 4)) * 12 + Number(l.slice(5)) : MONTHS.indexOf(l));
  const d = m(b) - m(a);
  return d === 1 || d === -11;
}

// The mock world's datasets: pipeline and city values are euros, everything else is a count.
const EURO_DATASETS = new Set(["pipeline_by_month", "leads_by_city"]);
const EURO_DEFAULT_TITLES = new Set(["Pipeline nach Monat", "Leads nach Stadt"]);

/** Dataset of a widget, from the render_widget call that produced it (ui.widget does not carry it). */
export function widgetDataset(s: Pick<HudState, "tools" | "toolOrder">, w: Widget): string | undefined {
  for (let i = s.toolOrder.length - 1; i >= 0; i--) {
    const t = s.tools[s.toolOrder[i]!];
    if (t?.tool === "render_widget" && t.startedAt <= w.at && typeof t.args.dataset === "string") return t.args.dataset;
  }
  return undefined;
}

/** Euro only where the dataset is known to be euros; never guessed from free text. */
export function widgetUnit(w: Pick<Widget, "kind" | "title">, dataset?: string): string {
  if (dataset) return EURO_DATASETS.has(dataset) ? "€" : "";
  return w.kind === "map" || EURO_DEFAULT_TITLES.has(w.title) ? "€" : "";
}

export const fmtNumber = (n: number, unit = "") => `${Math.round(n).toLocaleString("de-DE")}${unit ? ` ${unit}` : ""}`;

/** Headline parts: `em` is drawn in the accent colour. */
export type Headline = Array<{ text: string; em?: boolean }>;
export type Insight = { headline: Headline; highlight: number | null };

/** The headline states what the data says (computed, never invented); the chart is the evidence. */
export function widgetInsight(w: Widget, dataset?: string): Insight {
  const unit = widgetUnit(w, dataset);
  if (w.kind === "bar_chart" || w.kind === "line_chart") {
    const series = toSeries(w.data);
    if (!series.length) return { headline: [{ text: w.title }], highlight: null };
    const timeline = series.every((p) => isMonth(p.label) || isDay(p.label));
    if (timeline) {
      const last = series.at(-1)!;
      const prev = series.at(-2);
      const head: Headline = [{ text: fmtNumber(last.value, unit), em: true }];
      if (prev && prev.value) {
        const pct = Math.round(((last.value - prev.value) / Math.abs(prev.value)) * 100);
        const months = series.every((p) => isMonth(p.label));
        const ref = adjacent(prev.label, last.label) ? (months ? "zum Vormonat" : "zum Vortag") : `zum ${axisLabel(prev.label)}`;
        head.push({ text: pct === 0 ? `, unverändert ${ref}` : `, ${pct > 0 ? "plus" : "minus"} ${Math.abs(pct)} % ${ref}` });
      }
      return { headline: head, highlight: series.length - 1 };
    }
    const top = series.reduce((m, p, i) => (p.value > series[m]!.value ? i : m), 0);
    return { headline: [{ text: axisLabel(series[top]!.label), em: true }, { text: ` liegt vorn mit ${fmtNumber(series[top]!.value, unit)}` }], highlight: top };
  }
  if (w.kind === "map") {
    const pts = toPoints(w.data);
    if (!pts.length) return { headline: [{ text: w.title }], highlight: null };
    const top = pts.reduce((m, p, i) => (p.value > pts[m]!.value ? i : m), 0);
    return { headline: [{ text: pts[top]!.label, em: true }, { text: ` führt mit ${fmtNumber(pts[top]!.value, unit)}` }], highlight: top };
  }
  if (w.kind === "stat") {
    const st = toStat(w.data);
    if (!st) return { headline: [{ text: w.title }], highlight: null };
    const head: Headline = [{ text: fmtNumber(st.value, st.unit ?? unit), em: true }];
    if (st.delta !== undefined) head.push({ text: `, ${st.delta >= 0 ? "plus" : "minus"} ${Math.abs(Math.round(st.delta))} %` });
    return { headline: head, highlight: null };
  }
  const { rows } = toRows(w.data);
  return { headline: [{ text: String(rows.length), em: true }, { text: rows.length === 1 ? " Eintrag" : " Einträge" }], highlight: null };
}

/** The briefing point Jarvis is talking about right now: the newest that arrived. */
export function currentBriefingIndex(items: BriefingItem[]): number | null {
  return items.reduce<BriefingItem | null>((m, i) => (!m || i.at >= m.at ? i : m), null)?.index ?? null;
}

const ENTITY_LABEL: Record<Focus["entity"], string> = { lead: "Lead", mail: "Mail", event: "Termin", task: "Aufgabe", patient: "Patient", appointment: "Praxistermin" };
export const entityLabel = (e: Focus["entity"]) => ENTITY_LABEL[e];

const STOP = new Set(["gmbh", "praxis", "termin", "dringend", "angebot"]);

/** Facts about a focused entity that the conversation already brought up (nothing fetched, nothing invented). */
export function focusFacts(s: HudState, f: Pick<Focus, "label" | "entityId">): string[] {
  const words = f.label
    .split(/[\s–—,:?!]+/)
    .map((w) => w.replace(/[^\p{L}\d.:]/gu, ""))
    .filter((w) => /\p{L}{4,}/u.test(w) && !STOP.has(w.toLowerCase()));
  const key = words[0];
  const hit = (text: string) => text.includes(f.entityId) || (!!key && text.includes(key));
  const facts: string[] = [];
  for (const n of s.notices) if (n.entityId === f.entityId || hit(`${n.title} ${n.detail}`)) facts.push(`${n.title}: ${n.detail}`);
  for (const i of s.briefing.items) if (hit(`${i.title} ${i.detail}`)) facts.push(`${i.title}. ${i.detail}`);
  for (const id of s.taskOrder) {
    const t = s.tasks[id]!;
    if (t.status === "done" && t.result && hit(t.result)) facts.push(t.result);
  }
  return [...new Set(facts)].slice(0, 3);
}

// ---- computer use -------------------------------------------------------------------------

// The worker writes captions as first-person commands ("Wähle 10:00 Uhr"); on stage Jarvis is
// narrated in the third person ("Wählt 10:00 Uhr").
const THIRD: Record<string, string> = {
  Wähle: "Wählt",
  Klicke: "Klickt",
  Suche: "Sucht",
  Öffne: "Öffnet",
  Trage: "Trägt",
  Schreibe: "Schreibt",
  Drücke: "Drückt",
  Bewege: "Bewegt",
  Prüfe: "Prüft",
  Halte: "Hält",
  Lasse: "Lässt",
  Ziehe: "Zieht",
  Warte: "Wartet",
  Scrolle: "Scrollt",
  Vergrößere: "Vergrößert",
  Speichere: "Speichert",
  Sende: "Sendet",
};

/** Caption split so the key value (quoted text, typed text or a time) is highlighted. */
export function cuCaption(caption: string, typed?: string): Headline {
  const [first, ...rest] = caption.split(" ");
  const line = [THIRD[first!] ?? first, ...rest].join(" ");
  const quoted = /[„"'‚«]([^“"'‘»]+)[“"'‘»]/.exec(line);
  const time = /\d{1,2}:\d{2}(?: Uhr)?/.exec(line);
  const pick =
    quoted
      ? { at: quoted.index, len: quoted[0].length, text: quoted[1]! }
      : typed && line.includes(typed)
        ? { at: line.indexOf(typed), len: typed.length, text: typed }
        : time
          ? { at: time.index, len: time[0].length, text: time[0] }
          : null;
  if (!pick) return [{ text: line }];
  const parts: Headline = [];
  if (pick.at) parts.push({ text: line.slice(0, pick.at) });
  parts.push({ text: pick.text, em: true });
  const tail = line.slice(pick.at + pick.len);
  if (tail) parts.push({ text: tail });
  return parts;
}

// ---- call ---------------------------------------------------------------------------------

/** Progress strokes under the agent window: at most `max`, the lit share scaled to the real step. */
export function progressStrokes(step: number, total: number, max = 12): { shown: number; on: number } {
  if (total <= 0) return { shown: 0, on: 0 };
  const shown = Math.min(max, total);
  return { shown, on: Math.round((Math.min(step, total) / total) * shown) };
}

export const CALL_LABEL: Record<LiveCall, string> = { dialing: "WÄHLT", ringing: "KLINGELT", connected: "VERBUNDEN", ended: "BEENDET", failed: "FEHLGESCHLAGEN" };

/** Phone numbers stay private on stage: country code and the last two digits only. */
export function maskNumber(to: string): string | null {
  const digits = to.replace(/[^\d+]/g, "");
  if ((digits.match(/\d/g) ?? []).length < 6) return null;
  const cc = /^\+\d{2}/.exec(digits)?.[0] ?? "";
  const rest = digits.slice(cc.length);
  return `${cc ? `${cc} ` : ""}••• ${"•".repeat(Math.max(2, rest.length - 5))}${rest.slice(-2)}`;
}

/** The latest sentence spoken in the call (Jarvis or Leo), for the line under the name. */
export function callSentence(s: HudState): string | null {
  const ids = new Set(s.call?.turnIds ?? []);
  const t = [...s.turns].reverse().find((x) => ids.has(x.turnId) && x.text.trim());
  return t ? t.text.trim() : null;
}
