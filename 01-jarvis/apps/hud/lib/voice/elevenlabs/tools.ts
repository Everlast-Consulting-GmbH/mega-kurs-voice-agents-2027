import { applyLocalEvent } from "@/lib/events/store";
import { toolDisplayEvent } from "./display";
import { TOOL_META } from "@jarvis/contracts";

// Client tools for the ElevenLabs agent (docs/DECISIONS.md, 2026-10-09): every gateway tool
// runs in the browser as POST {orchestrator}/tools/{name}. The agent gets the ToolResult
// back as a JSON string; async tools answer with { taskId } at once.

export const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:8787";
const EVENTS_URL = process.env.NEXT_PUBLIC_EVENTS_URL ?? "ws://localhost:8787/events?sessionId=demo";

/** Tool calls must use the session the HUD listens to, or their events never arrive. */
const sessionOf = (eventsUrl: string) => new URL(eventsUrl.replace(/^ws/, "http")).searchParams.get("sessionId") ?? "demo";
export const SESSION_ID = sessionOf(EVENTS_URL);

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createClientTools({
  fetch = (i, init) => globalThis.fetch(i, init),
  baseUrl = ORCHESTRATOR_URL,
  eventsUrl = EVENTS_URL,
  sessionId = sessionOf(eventsUrl),
}: { fetch?: Fetch; baseUrl?: string; eventsUrl?: string; sessionId?: string } = {}) {
  const tools: Record<string, (params: Record<string, unknown>) => Promise<string>> = {};
  for (const name of Object.keys(TOOL_META)) {
    tools[name] = async (params) => {
      try {
        const res = await fetch(`${baseUrl}/tools/${name}?sessionId=${encodeURIComponent(sessionId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(params ?? {}),
        });
        const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
        if (!res.ok) return JSON.stringify({ ok: false, error: typeof body?.detail === "string" ? body.detail : `HTTP ${res.status}` });
        // Display-only reconciliation cannot change the outcome of a completed gateway action.
        try { const display = toolDisplayEvent(name, params, body); if (display) applyLocalEvent(display); } catch { /* Keep the actual gateway acknowledgement. */ }
        return JSON.stringify(body);
      } catch {
        return JSON.stringify({ ok: false, error: "Orchestrator nicht erreichbar" });
      }
    };
  }
  return tools;
}
