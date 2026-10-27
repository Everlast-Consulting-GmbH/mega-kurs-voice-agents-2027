import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseEnvFile, serverEnv } from "@/lib/server/env";
import { GET } from "@/app/api/elevenlabs/session/route";

describe("parseEnvFile", () => {
  it("reads KEY=VALUE lines, ignores comments and strips quotes and inline comments", () => {
    expect(
      parseEnvFile(`# Voice
ELEVENLABS_API_KEY=sk_123   # secret
ELEVENLABS_AGENT_ID="agent_abc"
EMPTY=
export FOO='bar'`),
    ).toEqual({ ELEVENLABS_API_KEY: "sk_123", ELEVENLABS_AGENT_ID: "agent_abc", EMPTY: "", FOO: "bar" });
  });
});

describe("serverEnv", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("prefers process env, then the root .env file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "env-"));
    const file = path.join(dir, ".env");
    writeFileSync(file, "ELEVENLABS_API_KEY=from-file\nELEVENLABS_AGENT_ID=agent_file\n");
    vi.stubEnv("JARVIS_ENV_FILE", file);
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    expect(serverEnv("ELEVENLABS_API_KEY")).toBe("from-file");
    vi.stubEnv("ELEVENLABS_API_KEY", "from-process");
    expect(serverEnv("ELEVENLABS_API_KEY")).toBe("from-process");
  });
});

describe("GET /api/elevenlabs/session", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function env(key = "sk_secret", agent = "agent_x") {
    vi.stubEnv("JARVIS_ENV_FILE", "/nonexistent/.env");
    vi.stubEnv("ELEVENLABS_API_KEY", key);
    vi.stubEnv("ELEVENLABS_AGENT_ID", agent);
    vi.stubEnv("NEXT_PUBLIC_ELEVENLABS_AGENT_ID", "");
  }

  it("asks the ElevenLabs API for a signed URL with the key in a header, never in the response", async () => {
    env();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_x&conversation_signature=s" })));
    vi.stubGlobal("fetch", fetch);
    const res = await GET(new Request("http://localhost:3000/api/elevenlabs/session"));
    expect(fetch).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_x", {
      headers: { "xi-api-key": "sk_secret" },
      cache: "no-store",
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ signedUrl: expect.stringContaining("conversation_signature") });
    expect(JSON.stringify(body)).not.toContain("sk_secret");
  });

  it("can hand out a WebRTC conversation token instead", async () => {
    env();
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ token: "tok" })));
    vi.stubGlobal("fetch", fetch);
    const res = await GET(new Request("http://localhost:3000/api/elevenlabs/session?transport=webrtc"));
    expect(fetch.mock.calls[0]![0]).toBe("https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent_x");
    expect(await res.json()).toEqual({ conversationToken: "tok" });
  });

  it("uses the EU-residency host when ELEVENLABS_API_BASE says so", async () => {
    env();
    vi.stubEnv("ELEVENLABS_API_BASE", "https://api.eu.residency.elevenlabs.io");
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ signed_url: "wss://x" })));
    vi.stubGlobal("fetch", fetch);
    await GET(new Request("http://localhost:3000/api/elevenlabs/session"));
    expect(fetch.mock.calls[0]![0]).toBe("https://api.eu.residency.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_x");
  });

  it("explains a missing key without calling ElevenLabs", async () => {
    env("");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const res = await GET(new Request("http://localhost:3000/api/elevenlabs/session"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("ELEVENLABS_API_KEY");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes upstream errors on as 502 without leaking the key", async () => {
    env();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "invalid api key sk_secret" }), { status: 401 })));
    const res = await GET(new Request("http://localhost:3000/api/elevenlabs/session"));
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("401");
    expect(text).not.toContain("sk_secret");
  });
});
