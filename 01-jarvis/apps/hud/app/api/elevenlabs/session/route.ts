import { serverEnv } from "@/lib/server/env";

// Hands the browser a short-lived ElevenLabs session credential. The API key stays here.
// Default: signed URL (WebSocket). ?transport=webrtc returns a conversation token instead.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Global default. For EU data residency set ELEVENLABS_API_BASE=https://api.eu.residency.elevenlabs.io
// (and NEXT_PUBLIC_ELEVENLABS_SERVER_LOCATION=eu-residency for the browser SDK).
const DEFAULT_API = "https://api.elevenlabs.io";

export async function GET(req: Request) {
  const transport = new URL(req.url).searchParams.get("transport") ?? serverEnv("ELEVENLABS_TRANSPORT") ?? "websocket";
  const key = serverEnv("ELEVENLABS_API_KEY");
  const agent = serverEnv("ELEVENLABS_AGENT_ID") || process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  if (!key) return Response.json({ error: "ELEVENLABS_API_KEY fehlt in der Root-.env" }, { status: 500 });
  if (!agent) return Response.json({ error: "ELEVENLABS_AGENT_ID fehlt" }, { status: 500 });

  const base = serverEnv("ELEVENLABS_API_BASE") || DEFAULT_API;
  const endpoint = transport === "webrtc" ? "token" : "get-signed-url";
  let res: Response;
  try {
    res = await fetch(`${base}/v1/convai/conversation/${endpoint}?agent_id=${encodeURIComponent(agent)}`, {
      headers: { "xi-api-key": key },
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "ElevenLabs nicht erreichbar" }, { status: 502 });
  }
  // Upstream bodies are not passed on: they could echo request details.
  if (!res.ok) return Response.json({ error: `ElevenLabs antwortet ${res.status}` }, { status: 502 });
  const body = (await res.json()) as { signed_url?: string; token?: string };
  return transport === "webrtc" ? Response.json({ conversationToken: body.token }) : Response.json({ signedUrl: body.signed_url });
}
