import { liveTool, liveTask } from "./observe";
import { RECENT_MS, rowAnchor } from "./deck";
import { TIMING } from "@/lib/derived";
import type { CalendarEvent, ChatMessage, Email, Lead } from "@jarvis/contracts";
import type { HudState } from "@/lib/events/reducer";
import type { Source } from "@/lib/apps/data";
import type { DesktopApp } from "@/lib/ui";

// "Systeme überwachen": what Jarvis can reach, grounded in the HUD's own data. Counts come from
// the app data (mock world or the bundled demo data), activity from the event stream. Nothing
// here claims a real internet or a healthy production system: the world is a test world.

export type SystemId = "mail" | "crm" | "calendar" | "team" | "computer" | "web";
export type SystemTone = "idle" | "active" | "done" | "error";

export type SystemNode = {
  id: SystemId;
  label: string;
  /** short headline number or state, e.g. "3 ungelesen" */
  metric: string;
  /** one honest line about where the data comes from */
  source: string;
  tone: SystemTone;
  /** what is happening right now, if anything ("Agent schreibt Mail") */
  activity: string | null;
  /** app window to open on click; null = show the info panel instead */
  app: DesktopApp | null;
  /** share of something countable, e.g. 2 of 5 inbox mails unread; null when there is none */
  gauge: { value: number; total: number } | null;
  color: string;
  /** where the link from Jarvis lands: the inner edge of the node's row in the control deck */
  x: number;
  y: number;
  side: "left" | "right";
};

export type SystemInput = {
  emails: Email[];
  leads: Lead[];
  events: CalendarEvent[];
  chat: Record<string, ChatMessage[]>;
  source: Record<"emails" | "leads" | "events" | "chat", Source>;
  hud: Pick<HudState, "run" | "tools" | "toolOrder" | "tasks" | "taskOrder" | "cu">;
  now: number;
};

/** Body centre on the 1920x1080 canvas (full-body view); expanded links run from here. */
export const BODY = { x: 960, y: 450 } as const;

const LAYOUT: Record<SystemId, { label: string; color: string; x: number; y: number; side: "left" | "right"; app: DesktopApp | null }> = {
  mail: { label: "Mail", color: "#4fa5ff", ...rowAnchor("systems", 0), side: "left", app: "mail" },
  crm: { label: "CRM", color: "#ab8bfa", ...rowAnchor("systems", 1), side: "left", app: "crm" },
  calendar: { label: "Kalender", color: "#f77e9e", ...rowAnchor("systems", 2), side: "left", app: "calendar" },
  team: { label: "Team", color: "#5ee0b5", ...rowAnchor("reach", 0), side: "right", app: null },
  computer: { label: "Computer", color: "#f8b565", ...rowAnchor("reach", 1), side: "right", app: null },
  web: { label: "Web", color: "#7fd8ff", ...rowAnchor("reach", 2), side: "right", app: null },
};
export const SYSTEM_ORDER: SystemId[] = ["mail", "crm", "calendar", "team", "computer", "web"];

/** Which system a tool call touches. Tools that span systems list all of them. */
const TOOL_SYSTEMS: Record<string, SystemId[]> = {
  list_emails: ["mail"],
  read_email: ["mail"],
  send_email: ["mail"],
  reply_email: ["mail"],
  list_leads: ["crm"],
  get_lead: ["crm"],
  move_deal: ["crm"],
  list_events: ["calendar"],
  create_event: ["calendar"],
  get_briefing: ["mail", "calendar", "crm"],
  post_message: ["team"],
  place_call: ["team"],
  start_computer_task: ["computer"],
};
const AGENT_SYSTEM: Record<string, SystemId> = { mail: "mail", calendar: "calendar", chat: "team", crm: "crm", praxis: "computer" };

export { RECENT_MS };

const sourceLine = (s: Source) => (s === "live" ? "Testwelt verbunden" : "Demo-Daten");

type Hit = { tone: SystemTone; activity: string; at: number };

/** Strongest current signal per system: running beats error beats recently done. */
export function systemActivity(hud: SystemInput["hud"], now: number): Partial<Record<SystemId, Hit>> {
  const hits: Partial<Record<SystemId, Hit>> = {};
  const rank: Record<SystemTone, number> = { idle: 0, done: 1, error: 2, active: 3 };
  const put = (id: SystemId, hit: Hit) => {
    const prev = hits[id];
    if (!prev || rank[hit.tone] > rank[prev.tone] || (rank[hit.tone] === rank[prev.tone] && hit.at > prev.at)) hits[id] = hit;
  };

  for (const callId of hud.toolOrder) {
    const t = hud.tools[callId];
    if (!t) continue;
    // delegate_task is not mapped: only tasks of kind "research" count as web work (below)
    const ids = TOOL_SYSTEMS[t.tool];
    if (!ids) continue;
    if (liveTool(t, now)) ids.forEach((id) => put(id, { tone: "active", activity: "Jarvis fragt ab", at: t.startedAt }));
    else if (t.finishedAt && now - t.finishedAt < RECENT_MS)
      ids.forEach((id) => put(id, { tone: t.status === "error" ? "error" : "done", activity: t.status === "error" ? "Abfrage fehlgeschlagen" : "Gerade abgefragt", at: t.finishedAt! }));
  }

  for (const taskId of hud.taskOrder) {
    const task = hud.tasks[taskId];
    if (!task) continue;
    const id: SystemId | null = task.kind === "computer_use" ? "computer" : task.kind === "research" ? "web" : null;
    if (!id) continue;
    if (liveTask(task, now)) put(id, { tone: "active", activity: task.kind === "research" ? "Recherche läuft" : "Computer Use läuft", at: task.updatedAt });
    else if (task.finishedAt && now - task.finishedAt < RECENT_MS)
      put(id, { tone: task.status === "failed" ? "error" : "done", activity: task.status === "failed" ? "Aufgabe gescheitert" : "Aufgabe erledigt", at: task.finishedAt });
  }

  const run = hud.run;
  if (run) {
    for (const agentId of run.agentOrder) {
      const agent = run.agents[agentId];
      const id = agent && AGENT_SYSTEM[agent.app];
      if (!agent || !id) continue;
      if (!agent.finished && !run.summary && now - agent.spawnedAt < TIMING.staleMs) put(id, { tone: "active", activity: `Agent „${agent.label}“ arbeitet`, at: agent.spawnedAt });
      else if (agent.finished && now - agent.finished.at < RECENT_MS)
        put(id, { tone: agent.finished.ok ? "done" : "error", activity: agent.finished.ok ? "Agent fertig" : "Agent gescheitert", at: agent.finished.at });
    }
  }
  return hits;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function nextEvent(events: CalendarEvent[], now: number): CalendarEvent | undefined {
  return events
    .filter((e) => Date.parse(e.end) >= now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/** The six nodes, with counts from the data and status from the event stream. */
export function summarizeSystems(input: SystemInput): SystemNode[] {
  const { emails, leads, events, chat, source, hud, now } = input;
  const hits = systemActivity(hud, now);
  const inbox = emails.filter((m) => m.folder === "inbox");
  const unread = inbox.filter((m) => m.unread).length;
  const openLeads = leads.filter((l) => l.status !== "gewonnen" && l.status !== "verloren").length;
  const next = nextEvent(events, now);
  const channels = Object.keys(chat).length;
  const messages = Object.values(chat).reduce((n, xs) => n + xs.length, 0);
  const cuSteps = hud.cu.taskId ? hud.cu.actions.length : 0;
  const research = hud.taskOrder.filter((id) => hud.tasks[id]?.kind === "research").length;

  const upcoming = events.filter((e) => Date.parse(e.end) >= now).length;
  const gauge = (value: number, total: number) => (total > 0 ? { value, total } : null);

  const base: Record<SystemId, { metric: string; source: string; gauge: SystemNode["gauge"] }> = {
    mail: { metric: unread ? `${unread} ungelesen` : plural(inbox.length, "Mail", "Mails"), source: sourceLine(source.emails), gauge: gauge(unread, inbox.length) },
    crm: { metric: `${openLeads} von ${plural(leads.length, "Lead", "Leads")} offen`, source: sourceLine(source.leads), gauge: gauge(openLeads, leads.length) },
    calendar: { metric: next ? `Nächster ${hhmm(next.start)}` : plural(events.length, "Termin", "Termine"), source: sourceLine(source.events), gauge: gauge(upcoming, events.length) },
    team: { metric: `${plural(channels, "Kanal", "Kanäle")} · ${messages} Nachr.`, source: sourceLine(source.chat), gauge: null },
    computer: { metric: cuSteps ? plural(cuSteps, "Schritt", "Schritte") : "Kein Lauf", source: "Testrechner, nur lokal", gauge: null },
    web: { metric: research ? plural(research, "Recherche", "Recherchen") : "Keine Recherche", source: "Nur auf Auftrag", gauge: null },
  };

  return SYSTEM_ORDER.map((id) => {
    const hit = hits[id];
    return { id, ...LAYOUT[id], ...base[id], tone: hit?.tone ?? "idle", activity: hit?.activity ?? null };
  });
}

/** Cubic link from Jarvis (body centre by default) to a node's row, leaving and landing horizontally. */
export function linkPath(node: Pick<SystemNode, "x" | "y" | "side">, from: { x: number; y: number } = BODY): string {
  const dir = node.side === "left" ? -1 : 1;
  const span = Math.abs(node.x - from.x);
  const c1x = Math.round(from.x + dir * span * 0.35);
  const c2x = Math.round(node.x - dir * span * 0.45);
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${node.y}, ${node.x} ${node.y}`;
}

/** Plain-German help for systems without an app window (Web, Computer, Team). */
export const SYSTEM_HELP: Record<"team" | "computer" | "web", { title: string; lines: string[] }> = {
  team: {
    title: "Team-Chat",
    lines: ["Kanäle #allgemein, #vertrieb und #delivery der Testwelt.", "Sag zum Beispiel: „Schreib dem Vertrieb, dass das Angebot raus ist.“"],
  },
  computer: {
    title: "Computer Use",
    lines: ["Jarvis bedient die PraxisPilot-App auf einem Testrechner in Docker.", "Läuft nur lokal. Start mit Taste C oder per Sprache."],
  },
  web: {
    title: "Web-Recherche",
    lines: ["Kein Dauerzugriff aufs Internet. Jarvis recherchiert nur auf Auftrag.", "Sag zum Beispiel: „Recherchier, was die Müller GmbH macht.“"],
  },
};
