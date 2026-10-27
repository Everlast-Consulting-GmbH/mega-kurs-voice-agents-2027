import type { EventOf, JarvisEvent, PayloadOf } from "@jarvis/contracts";

// Pure Event -> State reducer. The HUD holds no business logic: everything it shows is
// derived here from the event stream. `now` is the local receive time, used for animation
// timing (event `ts` comes from another clock).

type VoiceState = PayloadOf<"voice.state">["state"];
type Wt = { word: string; startMs: number; endMs: number };

export type Turn = {
  turnId: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
  words?: Wt[];
  startedAt: number;
  updatedAt: number;
  finalAt?: number;
};

export type ToolCall = {
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "ok" | "error";
  summary?: string;
  durationMs?: number;
  taskId?: string;
  startedAt: number;
  finishedAt?: number;
};

export type Task = PayloadOf<"task.created"> & {
  status: "running" | "done" | "failed";
  message?: string;
  step?: number;
  totalSteps?: number;
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
};

export type CuAction = PayloadOf<"cu.action"> & { receivedAt: number; seq: number };

export type CuState = {
  taskId: string | null;
  mode: "pixel" | "assisted" | null;
  vncUrl?: string;
  frame: { url: string; width: number; height: number; at: number } | null;
  actions: CuAction[];
};

export type Call = PayloadOf<"call.state"> & {
  since: number;
  connectedAt?: number;
  endedAt?: number;
  turnIds: string[];
};

export type Approval = PayloadOf<"approval.requested"> & {
  status: "pending" | "approved" | "rejected";
  via?: "click" | "voice";
  requestedAt: number;
  resolvedAt?: number;
};

export type Focus = PayloadOf<"ui.focus"> & { at: number; seq: number };
export type ContextItem = PayloadOf<"ui.focus"> & { at: number };
export type Widget = PayloadOf<"ui.widget"> & { at: number };
export type BriefingItem = PayloadOf<"briefing.item"> & { at: number };
export type LearnedTool = PayloadOf<"tool.learned"> & { at: number };
export type Notice = PayloadOf<"notice"> & { at: number };

// ---- multi-agent run (Szene "Jarvis arbeitet sichtbar in echten Programmen") ----------

export type RunAgent = PayloadOf<"agent.spawned"> & { spawnedAt: number; finished?: { ok: boolean; summary: string; at: number } };
export type RunAction = PayloadOf<"agent.action"> & { receivedAt: number; seq: number };
export type Run = {
  runId: string;
  title: string;
  steps: PayloadOf<"run.planned">["steps"];
  approvalId?: string;
  plannedAt: number | null;
  startedAt: number;
  agents: Record<string, RunAgent>;
  agentOrder: string[];
  actions: RunAction[];
  summary: (PayloadOf<"run.summary"> & { at: number }) | null;
};

export type LogEntry = {
  id: string;
  at: number;
  kind: "tool" | "task" | "approval" | "call" | "learned" | "notice";
  text: string;
  tone: "info" | "ok" | "warn" | "error";
  meta?: string;
};

export type HudState = {
  eventCount: number;
  lastEventAt: number | null;
  voice: { state: VoiceState; since: number };
  turns: Turn[];
  tools: Record<string, ToolCall>;
  toolOrder: string[];
  tasks: Record<string, Task>;
  taskOrder: string[];
  cu: CuState;
  call: Call | null;
  approvals: Record<string, Approval>;
  approvalOrder: string[];
  focus: Focus | null;
  context: ContextItem[];
  widgets: Widget[];
  briefing: { total: number; items: BriefingItem[]; startedAt: number | null };
  latency: { last: number | null; history: number[] };
  learned: LearnedTool[];
  notices: Notice[];
  run: Run | null;
  log: LogEntry[];
};

const MAX_TURNS = 20;
const MAX_TOOLS = 40;
const MAX_ACTIONS = 40;
const MAX_LOG = 60;
const MAX_CONTEXT = 8;
const MAX_WIDGETS = 4;
const MAX_LATENCY = 20;
const MAX_TASKS = 50;
const MAX_APPROVALS = 30;
const MAX_NOTICES = 5;
const MAX_RUN_ACTIONS = 200;

/** Drops the oldest ids beyond `max` from an order list and its record. */
function capped<T>(order: string[], dict: Record<string, T>, max: number, newestFirst = false): [string[], Record<string, T>] {
  if (order.length <= max) return [order, dict];
  const keep = newestFirst ? order.slice(0, max) : order.slice(-max);
  const drop = newestFirst ? order.slice(max) : order.slice(0, order.length - max);
  const next = { ...dict };
  for (const id of drop) delete next[id];
  return [keep, next];
}

export const initialState: HudState = {
  eventCount: 0,
  lastEventAt: null,
  voice: { state: "idle", since: 0 },
  turns: [],
  tools: {},
  toolOrder: [],
  tasks: {},
  taskOrder: [],
  cu: { taskId: null, mode: null, frame: null, actions: [] },
  call: null,
  approvals: {},
  approvalOrder: [],
  focus: null,
  context: [],
  widgets: [],
  briefing: { total: 0, items: [], startedAt: null },
  latency: { last: null, history: [] },
  learned: [],
  notices: [],
  run: null,
  log: [],
};

const tail = <T>(xs: T[], n: number) => (xs.length > n ? xs.slice(xs.length - n) : xs);

let logSeq = 0;
let actionSeq = 0;

const APP_LABEL: Record<RunAgent["app"], string> = { mail: "Mail", calendar: "Kalender", chat: "Slack", crm: "CRM", praxis: "PraxisPilot" };

/** The run an agent event belongs to; a new runId starts a fresh run (no plan seen). */
function runFor(s: HudState, runId: string, now: number): Run {
  if (s.run?.runId === runId) return s.run;
  return { runId, title: "", steps: [], plannedAt: null, startedAt: now, agents: {}, agentOrder: [], actions: [], summary: null };
}
function log(s: HudState, now: number, entry: Omit<LogEntry, "id" | "at">): LogEntry[] {
  return [{ id: `l${++logSeq}`, at: now, ...entry }, ...s.log].slice(0, MAX_LOG);
}

function upsertTurn(s: HudState, p: { turnId: string; role: Turn["role"] }, now: number, patch: (t: Turn) => Turn): Turn[] {
  const i = s.turns.findIndex((t) => t.turnId === p.turnId);
  if (i === -1) {
    const fresh: Turn = { turnId: p.turnId, role: p.role, text: "", final: false, startedAt: now, updatedAt: now };
    return tail([...s.turns, patch(fresh)], MAX_TURNS);
  }
  const next = s.turns.slice();
  next[i] = patch(next[i]!);
  return next;
}

function patchTask(s: HudState, taskId: string, now: number, patch: Partial<Task>): HudState["tasks"] {
  const prev: Task = s.tasks[taskId] ?? {
    taskId,
    title: taskId,
    kind: "other",
    status: "running",
    createdAt: now,
    updatedAt: now,
  };
  return { ...s.tasks, [taskId]: { ...prev, ...patch, updatedAt: now } };
}

/** Turns spoken while a call is connected belong to the call card. */
function attachToCall(call: Call | null, turnId: string): Call | null {
  return call && call.status === "connected" && !call.turnIds.includes(turnId) ? { ...call, turnIds: [...call.turnIds, turnId] } : call;
}

const withTaskOrder = (s: HudState, taskId: string) => (s.taskOrder.includes(taskId) ? s.taskOrder : [...s.taskOrder, taskId]);

type Handlers = { [T in JarvisEvent["type"]]: (s: HudState, e: EventOf<T>, now: number) => HudState };

const runHandlers = {
  "run.planned": (s: HudState, { payload: p }: EventOf<"run.planned">, now: number): HudState => {
    const prev = s.run?.runId === p.runId ? s.run : null;
    const run: Run = { ...(prev ?? runFor(s, p.runId, now)), title: p.title, steps: p.steps, approvalId: p.approvalId, plannedAt: now };
    // One approval for the whole plan, through the existing approval logic. The orchestrator
    // may or may not send its own approval.requested; the plan alone is enough to answer it.
    const id = p.approvalId;
    if (!id || s.approvals[id]) return { ...s, run };
    const approval: Approval = { approvalId: id, title: p.title, detail: p.steps.map((st) => st.summary).join(" · "), risk: "medium", status: "pending", requestedAt: now };
    return {
      ...s,
      run,
      approvals: { ...s.approvals, [id]: approval },
      approvalOrder: [id, ...s.approvalOrder],
      log: log(s, now, { kind: "approval", text: `Plan zur Freigabe: ${p.title}`, tone: "warn" }),
    };
  },

  "agent.spawned": (s: HudState, { payload: p }: EventOf<"agent.spawned">, now: number): HudState => {
    const run = runFor(s, p.runId, now);
    const agent: RunAgent = { ...p, spawnedAt: run.agents[p.agentId]?.spawnedAt ?? now };
    return {
      ...s,
      run: { ...run, agents: { ...run.agents, [p.agentId]: agent }, agentOrder: run.agentOrder.includes(p.agentId) ? run.agentOrder : [...run.agentOrder, p.agentId] },
    };
  },

  "agent.action": (s: HudState, { payload: p }: EventOf<"agent.action">, now: number): HudState => {
    const run = runFor(s, p.runId, now);
    const known = run.agents[p.agentId];
    // an action without a spawn still gets its window (events can be lost on reconnect)
    const agents = known ? run.agents : { ...run.agents, [p.agentId]: { runId: p.runId, agentId: p.agentId, app: p.app, label: APP_LABEL[p.app], spawnedAt: now } };
    const agentOrder = known ? run.agentOrder : [...run.agentOrder, p.agentId];
    return { ...s, run: { ...run, agents, agentOrder, actions: tail([...run.actions, { ...p, receivedAt: now, seq: ++actionSeq }], MAX_RUN_ACTIONS) } };
  },

  "agent.finished": (s: HudState, { payload: p }: EventOf<"agent.finished">, now: number): HudState => {
    const run = s.run?.runId === p.runId ? s.run : null;
    const agent = run?.agents[p.agentId];
    if (!run || !agent) return s;
    return { ...s, run: { ...run, agents: { ...run.agents, [p.agentId]: { ...agent, finished: { ok: p.ok, summary: p.summary, at: now } } } } };
  },

  "run.summary": (s: HudState, { payload: p }: EventOf<"run.summary">, now: number): HudState => {
    const run = runFor(s, p.runId, now);
    return {
      ...s,
      run: { ...run, title: run.title || p.title, summary: { ...p, at: now } },
      log: log(s, now, { kind: "task", text: `${p.title}: ${p.tasks} Aufgaben in ${Math.round(p.durationMs / 1000)} s`, tone: "ok" }),
    };
  },
} satisfies Pick<Handlers, "run.planned" | "agent.spawned" | "agent.action" | "agent.finished" | "run.summary">;

const handlers: Handlers = {
  ...runHandlers,

  "voice.state": (s, { payload }, now) =>
    s.voice.state === payload.state ? s : { ...s, voice: { state: payload.state, since: now } },

  "transcript.delta": (s, { payload: p }, now) => {
    // A delta for a turn that is already final means the turn id was reused (e.g. a
    // looped mock scenario): start it over as the newest turn instead of appending.
    const stale = s.turns.find((t) => t.turnId === p.turnId && t.final);
    const base = stale ? { ...s, turns: s.turns.filter((t) => t !== stale) } : s;
    return {
      ...base,
      turns: upsertTurn(base, p, now, (t) => ({ ...t, text: t.text + p.text, updatedAt: now })),
      call: attachToCall(s.call, p.turnId),
    };
  },

  "transcript.final": (s, { payload: p }, now) => ({
    ...s,
    turns: upsertTurn(s, p, now, (t) => ({
      ...t,
      text: p.text,
      words: p.words ?? t.words,
      final: true,
      finalAt: now,
      updatedAt: now,
    })),
    call: attachToCall(s.call, p.turnId),
  }),

  "tool.started": (s, { payload: p }, now) => ({
    ...s,
    tools: { ...s.tools, [p.callId]: { ...p, status: "running", startedAt: now } },
    toolOrder: tail([...s.toolOrder.filter((id) => id !== p.callId), p.callId], MAX_TOOLS),
  }),

  "tool.finished": (s, { payload: p }, now) => {
    const prev = s.tools[p.callId];
    const call: ToolCall = {
      callId: p.callId,
      tool: p.tool,
      args: prev?.args ?? {},
      startedAt: prev?.startedAt ?? now - p.durationMs,
      taskId: p.taskId ?? prev?.taskId,
      status: p.ok ? "ok" : "error",
      summary: p.summary,
      durationMs: p.durationMs,
      finishedAt: now,
    };
    const tools = { ...s.tools, [p.callId]: call };
    const toolOrder = prev ? s.toolOrder : tail([...s.toolOrder, p.callId], MAX_TOOLS);
    // Keep the dict bounded to what toolOrder still references.
    if (Object.keys(tools).length > MAX_TOOLS * 2) for (const id of Object.keys(tools)) if (!toolOrder.includes(id)) delete tools[id];
    return {
      ...s,
      tools,
      toolOrder,
      log: log(s, now, { kind: "tool", text: p.summary, tone: p.ok ? "ok" : "error", meta: `${p.tool} · ${p.durationMs} ms` }),
    };
  },

  "task.created": (s, { payload: p }, now) => ({
    ...s,
    tasks: { ...s.tasks, [p.taskId]: { ...p, status: "running", createdAt: now, updatedAt: now } },
    // A (re)created computer-use task starts with a clean screen and trail.
    cu: p.kind === "computer_use" && s.cu.taskId === p.taskId ? { taskId: p.taskId, mode: null, frame: null, actions: [] } : s.cu,
    taskOrder: withTaskOrder(s, p.taskId),
    log: log(s, now, { kind: "task", text: `Aufgabe gestartet: ${p.title}`, tone: "info" }),
  }),

  "task.progress": (s, { payload: p }, now) => ({
    ...s,
    tasks: patchTask(s, p.taskId, now, { message: p.message, step: p.step, totalSteps: p.totalSteps }),
    taskOrder: withTaskOrder(s, p.taskId),
  }),

  "task.done": (s, { payload: p }, now) => ({
    ...s,
    tasks: patchTask(s, p.taskId, now, { status: "done", result: p.result, finishedAt: now }),
    taskOrder: withTaskOrder(s, p.taskId),
    log: log(s, now, { kind: "task", text: p.result, tone: "ok" }),
  }),

  "task.failed": (s, { payload: p }, now) => ({
    ...s,
    tasks: patchTask(s, p.taskId, now, { status: "failed", error: p.error, finishedAt: now }),
    taskOrder: withTaskOrder(s, p.taskId),
    log: log(s, now, { kind: "task", text: p.error, tone: "error" }),
  }),

  "cu.frame": (s, { payload: p }, now) => ({
    ...s,
    cu: {
      ...(s.cu.taskId === p.taskId ? s.cu : { taskId: p.taskId, mode: null, actions: [] }),
      frame: { url: p.imageUrl, width: p.width, height: p.height, at: now },
    },
  }),

  "cu.action": (s, { payload: p }, now) => {
    const base: CuState = s.cu.taskId === p.taskId ? s.cu : { taskId: p.taskId, mode: null, frame: null, actions: [] };
    return {
      ...s,
      cu: { ...base, actions: tail([...base.actions, { ...p, receivedAt: now, seq: ++actionSeq }], MAX_ACTIONS) },
      tasks: s.tasks[p.taskId]
        ? patchTask(s, p.taskId, now, { message: p.caption, step: p.step, totalSteps: p.totalSteps ?? s.tasks[p.taskId]!.totalSteps })
        : s.tasks,
    };
  },

  "cu.mode": (s, { payload: p }, _now) => ({
    ...s,
    cu: {
      ...(s.cu.taskId === p.taskId ? s.cu : { taskId: p.taskId, frame: null, actions: [] }),
      mode: p.mode,
      vncUrl: p.vncUrl,
    },
  }),

  "call.state": (s, { payload: p }, now) => {
    const sameCall = s.call && s.call.callId === p.callId;
    const redial = sameCall && (s.call!.status === "ended" || s.call!.status === "failed") && (p.status === "dialing" || p.status === "ringing");
    const prev = sameCall && !redial ? s.call : null;
    const call: Call = {
      ...p,
      durationMs: p.durationMs ?? prev?.durationMs,
      since: prev?.status === p.status ? prev.since : now,
      connectedAt: p.status === "connected" ? (prev?.connectedAt ?? now) : prev?.connectedAt,
      endedAt: p.status === "ended" || p.status === "failed" ? now : undefined,
      turnIds: prev?.turnIds ?? [],
    };
    const text = {
      dialing: `Wähle ${p.to}`,
      ringing: `Es klingelt bei ${p.to}`,
      connected: `Verbunden mit ${p.to}`,
      ended: `Anruf mit ${p.to} beendet`,
      failed: `Anruf fehlgeschlagen${p.reason ? `: ${p.reason}` : ""}`,
    }[p.status];
    const tone = p.status === "failed" ? "error" : p.status === "connected" ? "ok" : "info";
    return { ...s, call, log: log(s, now, { kind: "call", text, tone }) };
  },

  "approval.requested": (s, { payload: p }, now) => ({
    ...s,
    approvals: { ...s.approvals, [p.approvalId]: { ...p, status: "pending", requestedAt: now } },
    approvalOrder: [p.approvalId, ...s.approvalOrder.filter((id) => id !== p.approvalId)],
    log: log(s, now, { kind: "approval", text: `Freigabe nötig: ${p.title}`, tone: "warn" }),
  }),

  "approval.resolved": (s, { payload: p }, now) => {
    const prev = s.approvals[p.approvalId];
    if (prev && prev.status !== "pending") return s;
    const approval: Approval = {
      ...(prev ?? { approvalId: p.approvalId, title: p.approvalId, detail: "", risk: "low", requestedAt: now }),
      status: p.approved ? "approved" : "rejected",
      via: p.via,
      resolvedAt: now,
    };
    return {
      ...s,
      approvals: { ...s.approvals, [p.approvalId]: approval },
      approvalOrder: s.approvalOrder.includes(p.approvalId) ? s.approvalOrder : [p.approvalId, ...s.approvalOrder],
      log: log(s, now, {
        kind: "approval",
        text: `${approval.title}: ${p.approved ? "freigegeben" : "abgelehnt"} (${p.via === "click" ? "Klick" : "Stimme"})`,
        tone: p.approved ? "ok" : "warn",
      }),
    };
  },

  "ui.focus": (s, { payload: p }, now) => ({
    ...s,
    // seq changes on every focus, so re-focusing the same entity replays the flight.
    focus: { ...p, at: now, seq: (s.focus?.seq ?? 0) + 1 },
    context: [{ ...p, at: now }, ...s.context.filter((c) => !(c.entity === p.entity && c.entityId === p.entityId))].slice(0, MAX_CONTEXT),
  }),

  "ui.widget": (s, { payload: p }, now) => ({
    ...s,
    widgets: [{ ...p, at: now }, ...s.widgets.filter((w) => w.widgetId !== p.widgetId)].slice(0, MAX_WIDGETS),
  }),

  "briefing.item": (s, { payload: p }, now) => {
    const restart = p.index === 0;
    const items = (restart ? [] : s.briefing.items.filter((i) => i.index !== p.index)).concat({ ...p, at: now });
    items.sort((a, b) => a.index - b.index);
    return { ...s, briefing: { total: p.total, items, startedAt: restart ? now : (s.briefing.startedAt ?? now) } };
  },

  "metrics.latency": (s, { payload: p }) => ({
    ...s,
    latency: { last: p.firstAudioMs, history: tail([...s.latency.history, p.firstAudioMs], MAX_LATENCY) },
  }),

  "tool.learned": (s, { payload: p }, now) => ({
    ...s,
    learned: [{ ...p, at: now }, ...s.learned.filter((l) => l.tool !== p.tool)],
    log: log(s, now, { kind: "learned", text: `Neues Tool gelernt: ${p.tool}`, tone: "ok", meta: `${p.endpoints.length} Endpunkte` }),
  }),

  notice: (s, { payload: p }, now) =>
    s.notices.some((n) => n.noticeId === p.noticeId)
      ? s
      : {
          ...s,
          notices: [{ ...p, at: now }, ...s.notices].slice(0, MAX_NOTICES),
          log: log(s, now, { kind: "notice", text: p.severity === "urgent" ? `Dringend: ${p.title}` : p.title, tone: p.severity === "urgent" ? "warn" : "info" }),
        },
};

export function reduce(state: HudState, event: JarvisEvent, now: number = Date.now()): HudState {
  const handler = handlers[event.type] as (s: HudState, e: JarvisEvent, now: number) => HudState;
  const next = handler(state, event, now);
  const [taskOrder, tasks] = capped(next.taskOrder, next.tasks, MAX_TASKS);
  const [approvalOrder, approvals] = capped(next.approvalOrder, next.approvals, MAX_APPROVALS, true);
  return { ...next, taskOrder, tasks, approvalOrder, approvals, eventCount: state.eventCount + 1, lastEventAt: now };
}
