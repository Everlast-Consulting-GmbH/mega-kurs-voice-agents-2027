import { z } from "zod";

// Every message on the event stream (orchestrator -> HUD and HUD -> orchestrator)
// is one of these. Source of truth for TS and Python (see scripts/gen.ts).

const base = {
  id: z.string().min(1),
  ts: z.number().int().describe("Unix epoch milliseconds"),
  sessionId: z.string().min(1),
};

const ev = <T extends string, P extends z.ZodObject>(type: T, payload: P) =>
  z
    .object({ ...base, type: z.literal(type), payload: payload.meta({ id: eventName(type).replace(/Event$/, "Payload") }) })
    .meta({ id: eventName(type) });

function eventName(type: string): string {
  return (
    type
      .split(/[._]/)
      .map((s) => s[0]!.toUpperCase() + s.slice(1))
      .join("") + "Event"
  );
}

export const VoiceState = z
  .enum(["idle", "listening", "thinking", "speaking", "acting"])
  .meta({ id: "VoiceState" });

export const Role = z.enum(["user", "assistant"]).meta({ id: "Role" });

export const EntityKind = z
  .enum(["lead", "mail", "event", "task", "patient", "appointment"])
  .meta({ id: "EntityKind" });

export const WordTiming = z
  .object({ word: z.string(), startMs: z.number(), endMs: z.number() })
  .meta({ id: "WordTiming" });

export const CuActionKind = z
  .enum(["click", "double_click", "type", "key", "scroll", "move", "drag", "wait", "screenshot"])
  .meta({ id: "CuActionKind" });

export const CallStatus = z
  .enum(["dialing", "ringing", "connected", "ended", "failed"])
  .meta({ id: "CallStatus" });

export const WidgetKind = z.enum(["bar_chart", "line_chart", "table", "map", "stat"]).meta({ id: "WidgetKind" });

export const VoiceStateEvent = ev(
  "voice.state",
  z.object({ state: VoiceState }),
);

export const TranscriptDeltaEvent = ev(
  "transcript.delta",
  z.object({
    turnId: z.string(),
    role: Role,
    text: z.string().describe("Text appended to this turn"),
  }),
);

export const TranscriptFinalEvent = ev(
  "transcript.final",
  z.object({
    turnId: z.string(),
    role: Role,
    text: z.string().describe("Full text of the turn"),
    words: z.array(WordTiming).optional(),
  }),
);

export const ToolStartedEvent = ev(
  "tool.started",
  z.object({
    callId: z.string(),
    tool: z.string(),
    args: z.record(z.string(), z.unknown()),
    taskId: z.string().optional().describe("Set when called inside a delegated task"),
  }),
);

export const ToolFinishedEvent = ev(
  "tool.finished",
  z.object({
    callId: z.string(),
    tool: z.string(),
    ok: z.boolean(),
    summary: z.string().describe("One line, German, shown in the HUD timeline"),
    durationMs: z.number(),
    taskId: z.string().optional(),
  }),
);

export const TaskCreatedEvent = ev(
  "task.created",
  z.object({
    taskId: z.string(),
    title: z.string(),
    kind: z.enum(["research", "computer_use", "call", "other"]),
  }),
);

export const TaskProgressEvent = ev(
  "task.progress",
  z.object({
    taskId: z.string(),
    message: z.string(),
    step: z.number().int().optional(),
    totalSteps: z.number().int().optional(),
  }),
);

export const TaskDoneEvent = ev(
  "task.done",
  z.object({ taskId: z.string(), result: z.string() }),
);

export const TaskFailedEvent = ev(
  "task.failed",
  z.object({ taskId: z.string(), error: z.string() }),
);

export const CuFrameEvent = ev(
  "cu.frame",
  z.object({
    taskId: z.string(),
    imageUrl: z.string().describe("PNG/JPEG/SVG URL or data URL of the agent screen"),
    width: z.number().int(),
    height: z.number().int(),
  }),
);

export const CuActionEvent = ev(
  "cu.action",
  z.object({
    taskId: z.string(),
    action: CuActionKind,
    x: z.number().optional(),
    y: z.number().optional(),
    target: z
      .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
      .optional()
      .describe("Bounding box of the element being targeted, screen pixels"),
    text: z.string().optional().describe("Typed text or key name"),
    caption: z.string().describe("German subtitle, e.g. Klicke auf 'Neuer Termin'"),
    step: z.number().int(),
    totalSteps: z.number().int().optional(),
  }),
);

export const CuModeEvent = ev(
  "cu.mode",
  z.object({ taskId: z.string(), mode: z.enum(["pixel", "assisted"]), vncUrl: z.string().optional() }),
);

export const CallStateEvent = ev(
  "call.state",
  z.object({
    callId: z.string(),
    status: CallStatus,
    to: z.string().describe("Display name or masked number"),
    durationMs: z.number().optional(),
    reason: z.string().optional(),
  }),
);

export const ApprovalRequestedEvent = ev(
  "approval.requested",
  z.object({
    approvalId: z.string(),
    title: z.string(),
    detail: z.string(),
    risk: z.enum(["low", "medium", "high"]),
  }),
);

export const ApprovalResolvedEvent = ev(
  "approval.resolved",
  z.object({
    approvalId: z.string(),
    approved: z.boolean(),
    via: z.enum(["click", "voice"]),
  }),
);

export const UiFocusEvent = ev(
  "ui.focus",
  z.object({
    entity: EntityKind,
    entityId: z.string(),
    label: z.string(),
    durationMs: z.number().optional(),
  }),
);

export const UiWidgetEvent = ev(
  "ui.widget",
  z.object({
    widgetId: z.string(),
    kind: WidgetKind,
    title: z.string(),
    data: z.unknown().describe("Kind-specific data, see docs in tools.ts renderWidget"),
  }),
);

export const BriefingItemEvent = ev(
  "briefing.item",
  z.object({
    index: z.number().int().min(0).describe("0-based; index 0 starts a new briefing in the HUD"),
    total: z.number().int(),
    icon: z.enum(["calendar", "mail", "lead", "alert", "weather", "money", "task"]),
    title: z.string(),
    detail: z.string(),
    metric: z.object({ label: z.string(), value: z.number(), unit: z.string().optional() }).optional(),
  }),
);

export const MetricsLatencyEvent = ev(
  "metrics.latency",
  z.object({ turnId: z.string(), firstAudioMs: z.number() }),
);

export const ToolLearnedEvent = ev(
  "tool.learned",
  z.object({
    tool: z.string(),
    description: z.string(),
    endpoints: z.array(z.object({ method: z.string(), path: z.string() })),
  }),
);

export const NoticeEvent = ev(
  "notice",
  z.object({
    noticeId: z.string(),
    severity: z.enum(["info", "urgent"]).describe("urgent: Jarvis interrupts proactively"),
    title: z.string().describe("German, shown on the alert card"),
    detail: z.string(),
    entity: EntityKind.optional(),
    entityId: z.string().optional(),
  }),
);

// ---- Multi-agent runs (Szene "Jarvis arbeitet sichtbar in echten Programmen") ----------
// One voice request becomes a run; the orchestrator plans it into agents, one per app.
// The HUD renders each agent as a cursor in a realistic app window and animates agent.action.

export const AgentApp = z
  .enum(["mail", "calendar", "chat", "crm", "praxis"])
  .meta({ id: "AgentApp" });

export const RunPlannedEvent = ev(
  "run.planned",
  z.object({
    runId: z.string(),
    title: z.string().describe("German, e.g. 'Müller GmbH: Unterschrift vorbereiten'"),
    steps: z.array(z.object({ agentId: z.string(), app: AgentApp, summary: z.string() })),
    approvalId: z.string().optional().describe("Set when the plan needs one approval before it runs"),
  }),
);

export const AgentSpawnedEvent = ev(
  "agent.spawned",
  z.object({
    runId: z.string(),
    agentId: z.string(),
    app: AgentApp,
    label: z.string().describe("German chip text, e.g. 'Mail · schreibt'"),
  }),
);

export const AgentActionEvent = ev(
  "agent.action",
  z.object({
    runId: z.string(),
    agentId: z.string(),
    app: AgentApp,
    action: z
      .enum(["open", "select", "type", "move", "create", "send"])
      .describe("open app/view, select a record, type text, move a card/event, create a record, send"),
    entityId: z.string().optional().describe("Record the action targets (email, event, lead, message id)"),
    field: z.string().optional().describe("For type: which field, e.g. 'body', 'subject'"),
    text: z.string().optional().describe("For type: the full text to type; the HUD animates it"),
    from: z.string().optional().describe("For move: old column/slot, e.g. 'angebot'"),
    to: z.string().optional().describe("For move: new column/slot, e.g. 'verhandlung'"),
    caption: z.string().describe("German, one short line describing the action"),
  }),
);

export const AgentFinishedEvent = ev(
  "agent.finished",
  z.object({ runId: z.string(), agentId: z.string(), ok: z.boolean(), summary: z.string() }),
);

export const RunSummaryEvent = ev(
  "run.summary",
  z.object({
    runId: z.string(),
    title: z.string(),
    tasks: z.number().int(),
    durationMs: z.number(),
    humanMinutes: z.number().describe("Rough estimate of manual effort, shown as the punchline"),
  }),
);

export const JarvisEvent = z
  .discriminatedUnion("type", [
    VoiceStateEvent,
    TranscriptDeltaEvent,
    TranscriptFinalEvent,
    ToolStartedEvent,
    ToolFinishedEvent,
    TaskCreatedEvent,
    TaskProgressEvent,
    TaskDoneEvent,
    TaskFailedEvent,
    CuFrameEvent,
    CuActionEvent,
    CuModeEvent,
    CallStateEvent,
    ApprovalRequestedEvent,
    ApprovalResolvedEvent,
    UiFocusEvent,
    UiWidgetEvent,
    BriefingItemEvent,
    MetricsLatencyEvent,
    ToolLearnedEvent,
    NoticeEvent,
    RunPlannedEvent,
    AgentSpawnedEvent,
    AgentActionEvent,
    AgentFinishedEvent,
    RunSummaryEvent,
  ])
  .meta({ id: "JarvisEvent" });

export type JarvisEvent = z.infer<typeof JarvisEvent>;
export type JarvisEventType = JarvisEvent["type"];
export type EventOf<T extends JarvisEventType> = Extract<JarvisEvent, { type: T }>;
export type PayloadOf<T extends JarvisEventType> = EventOf<T>["payload"];

/** Events the HUD may send back over the same WebSocket. */
export const CLIENT_EVENT_TYPES = ["approval.resolved"] as const satisfies readonly JarvisEventType[];

export function parseEvent(raw: unknown): JarvisEvent {
  return JarvisEvent.parse(raw);
}

export function safeParseEvent(raw: unknown) {
  return JarvisEvent.safeParse(raw);
}

let counter = 0;
export function makeEvent<T extends JarvisEventType>(
  type: T,
  payload: PayloadOf<T>,
  sessionId = "demo",
): EventOf<T> {
  counter += 1;
  return {
    id: `${Date.now().toString(36)}-${counter}`,
    ts: Date.now(),
    sessionId,
    type,
    payload,
  } as EventOf<T>;
}
