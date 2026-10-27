import type { PayloadOf } from "@jarvis/contracts";
import type { HudState, Run, RunAction } from "@/lib/events/reducer";

// Pure side of the multi-agent scene (apps/hud/design/agents-desktop-mockup.html, Bild A/B):
// who works in which window, and how each agent's actions play back over time. The
// orchestrator decides what happens; the HUD only decides how long it takes to watch it.

export type AgentApp = PayloadOf<"agent.spawned">["app"];
export type ActionKind = RunAction["action"];

/** Fixed window order so a window never jumps when another agent spawns. */
export const APP_ORDER: AgentApp[] = ["mail", "calendar", "chat", "crm", "praxis"];

export const AGENT_LOOK: Record<AgentApp, { color: string; agent: string; app: string }> = {
  mail: { color: "#6c5ce7", agent: "Mail-Agent", app: "Mail" },
  calendar: { color: "#ff9f6b", agent: "Kalender-Agent", app: "Kalender" },
  chat: { color: "#1d7fd1", agent: "Slack-Agent", app: "Slack" },
  crm: { color: "#22c55e", agent: "CRM-Agent", app: "CRM" },
  praxis: { color: "#0d9488", agent: "Praxis-Agent", app: "PraxisPilot" },
};

// ---- playback schedule ------------------------------------------------------------------

/** The cursor needs this long to reach its target before the action visibly happens. */
export const TRAVEL_MS: Record<ActionKind, number> = { open: 250, select: 450, type: 380, move: 450, create: 420, send: 450 };
const AFTER_MS: Record<ActionKind, number> = { open: 350, select: 300, type: 250, move: 1100, create: 500, send: 550 };
export const TYPE_MS_PER_CHAR = 30;
const TYPE_MAX_MS = 3200;

export type Played = RunAction & {
  /** cursor starts moving */
  start: number;
  /** the action visibly happens (click, first key, card picked up) */
  hit: number;
  end: number;
};

export function actionMs(a: Pick<RunAction, "action" | "text">): { travel: number; work: number } {
  const travel = TRAVEL_MS[a.action];
  if (a.action === "type") return { travel, work: Math.min(TYPE_MAX_MS, Math.max(500, (a.text?.length ?? 0) * TYPE_MS_PER_CHAR)) + AFTER_MS.type };
  return { travel, work: AFTER_MS[a.action] };
}

/**
 * Per agent, actions play one after another: each starts when it arrived, but never before
 * the previous one has finished playing. A backend that fires everything at once still looks
 * like someone working; one that paces its events is followed exactly.
 */
const scheduled = new WeakMap<RunAction[], Map<string, Played[]>>();

export function schedule(actions: RunAction[]): Map<string, Played[]> {
  // the reducer replaces the array on every action, so one schedule per array is enough
  const hit = scheduled.get(actions);
  if (hit) return hit;
  const out = new Map<string, Played[]>();
  for (const a of actions) {
    const list = out.get(a.agentId) ?? [];
    const prevEnd = list.at(-1)?.end ?? -Infinity;
    const start = Math.max(a.receivedAt, prevEnd);
    const { travel, work } = actionMs(a);
    list.push({ ...a, start, hit: start + travel, end: start + travel + work });
    out.set(a.agentId, list);
  }
  scheduled.set(actions, out);
  return out;
}

/** The action playing at `now` (or the last one played) and how far it is, 0..1 after `hit`. */
export function playhead(played: Played[], now: number): { current: Played | null; index: number; progress: number } {
  let index = -1;
  for (let i = 0; i < played.length; i++) if (played[i]!.start <= now) index = i;
  const current = index >= 0 ? played[index]! : null;
  if (!current) return { current, index, progress: 0 };
  const progress = now <= current.hit ? 0 : Math.min(1, (now - current.hit) / Math.max(1, current.end - current.hit));
  return { current, index, progress };
}

/** Actions whose visible moment has passed (the state they produce is on screen). */
export const happened = (played: Played[], now: number) => played.filter((p) => p.hit <= now);

/** How many characters of a `type` action are on screen. */
export function typedChars(p: Played, now: number): number {
  if (now <= p.hit) return 0;
  const typing = Math.max(1, p.end - p.hit - AFTER_MS.type);
  return Math.min(p.text?.length ?? 0, Math.floor(((now - p.hit) / typing) * (p.text?.length ?? 0)));
}

// ---- run phases -------------------------------------------------------------------------

export const RUN_TIMING = {
  settleMs: 900, // the last result stays readable before the windows fly back
  summaryMs: 8000, // Bild B
  staleMs: 45_000, // a run without summary and without news is over
};

/** When the last agent's playback ends (null before any action). */
export function workEnd(run: Run): number | null {
  let end: number | null = null;
  for (const list of schedule(run.actions).values()) end = Math.max(end ?? -Infinity, list.at(-1)!.end);
  return end;
}

export type RunPhase = "none" | "plan" | "work" | "summary";

/** Bild B appears when the orchestrator says it is done and the HUD has played everything. */
export function summaryAt(run: Run): number | null {
  if (!run.summary) return null;
  return Math.max(run.summary.at, (workEnd(run) ?? -Infinity) + RUN_TIMING.settleMs);
}

export function runPhase(s: Pick<HudState, "run" | "approvals">, now: number): RunPhase {
  const run = s.run;
  if (!run) return "none";
  const show = summaryAt(run);
  if (show !== null) {
    if (now >= show + RUN_TIMING.summaryMs) return "none";
    if (now >= show) return "summary";
    return run.agentOrder.length ? "work" : "none";
  }
  const lastNews = Math.max(run.startedAt, run.plannedAt ?? 0, run.actions.at(-1)?.receivedAt ?? 0, ...run.agentOrder.map((id) => run.agents[id]!.spawnedAt));
  if (now - Math.max(lastNews, workEnd(run) ?? 0) > RUN_TIMING.staleMs) return "none";
  if (run.agentOrder.length) return "work";
  const a = run.approvalId ? s.approvals[run.approvalId] : undefined;
  if (a?.status === "rejected") return "none";
  return run.plannedAt !== null ? "plan" : "none";
}

/** At most this many windows (and chips) fit the desk; further agents still work, unseen. */
export const MAX_AGENT_WINDOWS = 4;

/** Agents in window order. */
export function runAgents(run: Run) {
  return run.agentOrder
    .map((id) => run.agents[id]!)
    .sort((a, b) => APP_ORDER.indexOf(a.app) - APP_ORDER.indexOf(b.app))
    .slice(0, MAX_AGENT_WINDOWS);
}

/** Chip state: working until its finish arrived and its playback is over. */
export function agentDone(run: Run, agentId: string, now: number): boolean {
  const a = run.agents[agentId];
  if (!a?.finished) return false;
  const list = schedule(run.actions).get(agentId);
  return !list || now >= list.at(-1)!.end;
}

/** Bild B: "4 Aufgaben · 11 Sekunden" and the human estimate. */
export function summaryLines(p: { tasks: number; durationMs: number; humanMinutes: number }) {
  const sec = Math.max(1, Math.round(p.durationMs / 1000));
  const min = Math.max(1, Math.round(p.humanMinutes));
  const parts = {
    tasks: p.tasks,
    taskWord: p.tasks === 1 ? "Aufgabe" : "Aufgaben",
    sec,
    secWord: sec === 1 ? "Sekunde" : "Sekunden",
    min,
    minWord: min === 1 ? "Minute" : "Minuten",
  };
  return {
    big: `${parts.tasks} ${parts.taskWord} · ${sec} ${parts.secWord}`,
    small: `Ein Mensch hätte dafür etwa ${min} ${parts.minWord} gebraucht.`,
    parts,
  };
}
