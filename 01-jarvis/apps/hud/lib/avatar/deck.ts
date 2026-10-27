import type { HudState, LogEntry } from "@/lib/events/reducer";
import { liveTool } from "./observe";

// The control deck around Jarvis in calm mode: fixed panel geometry on the 1920x1080 canvas,
// the ring of tools around his head and the activity feed. Everything shown is read from the
// HUD's own event stream; nothing here invents load, traffic or hardware numbers.

export type Box = { left: number; top: number; width: number; height: number };

/** Two slim columns at the screen edges; the centre belongs to Jarvis. Both end above the dock. */
export const PANELS = {
  systems: { left: 40, top: 112, width: 372, height: 288 },
  activity: { left: 40, top: 416, width: 372, height: 484 },
  network: { left: 1508, top: 112, width: 372, height: 288 },
  reach: { left: 1508, top: 416, width: 372, height: 264 },
  voice: { left: 1508, top: 696, width: 372, height: 204 },
} as const satisfies Record<string, Box>;
export const PANEL_HEAD = 40;
export const ROW_H = { systems: 80, reach: 72 } as const;

/** Inner edge and vertical centre of row i in a panel: where a link from Jarvis lands. */
export function rowAnchor(panel: "systems" | "reach", i: number) {
  const p = PANELS[panel];
  const x = panel === "systems" ? p.left + p.width : p.left;
  return { x, y: p.top + PANEL_HEAD + i * ROW_H[panel] + ROW_H[panel] / 2 };
}

/** The head outline in the calm close-up (orbPose "calm"); closed-view links start on it. */
export const HEAD = { x: 960, y: 366, rx: 168, ry: 222 } as const;

export function headAnchor(to: { x: number; y: number }) {
  const a = Math.atan2((to.y - HEAD.y) / HEAD.ry, (to.x - HEAD.x) / HEAD.rx);
  return { x: Math.round(HEAD.x + Math.cos(a) * HEAD.rx), y: Math.round(HEAD.y + Math.sin(a) * HEAD.ry) };
}

/** A finished call or agent still glows this long, so the audience can see where it went. */
export const RECENT_MS = 6000;

export type ToolTone = "idle" | "active" | "done" | "error";
export type ToolSpot = { tool: string; label: string; uses: number; tone: ToolTone; x: number; y: number; side: "left" | "right" | "top" };

/** Every gateway tool, grouped by the system it touches so neighbours on the ring belong together. */
export const TOOL_RING: ReadonlyArray<readonly [string, string]> = [
  ["list_emails", "Posteingang"],
  ["read_email", "Mail lesen"],
  ["reply_email", "Antworten"],
  ["send_email", "Mail senden"],
  ["get_briefing", "Briefing"],
  ["list_events", "Termine"],
  ["create_event", "Termin anlegen"],
  ["handle_request", "Agenten"],
  ["delegate_task", "Delegieren"],
  ["resolve_approval", "Freigabe"],
  ["focus_entity", "Fokus"],
  ["render_widget", "Diagramm"],
  ["post_message", "Team-Chat"],
  ["place_call", "Anruf"],
  ["start_computer_task", "Computer"],
  ["list_leads", "Leads"],
  ["get_lead", "Lead-Detail"],
  ["move_deal", "Pipeline"],
];

/** Ring around the calm head: an arc from lower left over the top to lower right. */
export const RING = { x: 960, y: 404, rx: 430, ry: 286, from: 162, to: 378 } as const;

/** Where each tool sits, how often it ran (of the calls the HUD still holds) and whether it is live. */
export function toolRing(hud: Pick<HudState, "tools" | "toolOrder">, now: number): ToolSpot[] {
  const uses = new Map<string, number>();
  const tone = new Map<string, { tone: ToolTone; at: number }>();
  const rank: Record<ToolTone, number> = { idle: 0, done: 1, error: 2, active: 3 };
  for (const id of hud.toolOrder) {
    const t = hud.tools[id];
    if (!t) continue;
    uses.set(t.tool, (uses.get(t.tool) ?? 0) + 1);
    const hit: ToolTone | null = liveTool(t, now) ? "active" : t.finishedAt && now - t.finishedAt < RECENT_MS ? (t.status === "error" ? "error" : "done") : null;
    const prev = tone.get(t.tool);
    if (hit && (!prev || rank[hit] >= rank[prev.tone])) tone.set(t.tool, { tone: hit, at: t.startedAt });
  }
  const n = TOOL_RING.length;
  return TOOL_RING.map(([tool, label], i) => {
    const deg = RING.from + ((RING.to - RING.from) * i) / (n - 1);
    const a = (deg * Math.PI) / 180;
    const cos = Math.cos(a);
    return {
      tool,
      label,
      uses: uses.get(tool) ?? 0,
      tone: tone.get(tool)?.tone ?? "idle",
      x: Math.round(RING.x + cos * RING.rx),
      y: Math.round(RING.y + Math.sin(a) * RING.ry),
      side: Math.abs(cos) < 0.28 ? "top" : cos < 0 ? "left" : "right",
    };
  });
}

const RING_LABEL = Object.fromEntries(TOOL_RING);

export type FeedEntry = { id: string; at: number; text: string; tone: LogEntry["tone"]; meta?: string; live: boolean };

/** Running tool calls first (they have no log entry yet), then the reducer's log, newest first. */
export function activityFeed(hud: Pick<HudState, "tools" | "toolOrder" | "log">, now: number, limit = 8): FeedEntry[] {
  const live: FeedEntry[] = [...hud.toolOrder]
    .reverse()
    .map((id) => hud.tools[id])
    .filter((t): t is NonNullable<typeof t> => !!t && liveTool(t, now))
    .map((t) => ({ id: `live-${t.callId}`, at: t.startedAt, text: `${RING_LABEL[t.tool] ?? t.tool} läuft`, tone: "info", meta: t.tool, live: true }));
  const logged: FeedEntry[] = hud.log.map((e) => ({ id: e.id, at: e.at, text: e.text, tone: e.tone, meta: e.meta, live: false }));
  return [...live, ...logged].slice(0, limit);
}

/** Log entries inside the last `windowMs`, as 0..1 positions on a time axis (1 = now). */
export function timelineTicks(log: LogEntry[], now: number, windowMs = 5 * 60_000) {
  return log
    .filter((e) => now - e.at <= windowMs && e.at <= now)
    .map((e) => ({ id: e.id, x: 1 - (now - e.at) / windowMs, tone: e.tone }));
}

export const clock = (at: number) => new Date(at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
