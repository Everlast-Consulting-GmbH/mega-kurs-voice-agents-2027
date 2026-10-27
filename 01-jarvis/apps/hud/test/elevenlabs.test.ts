import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { makeEvent, TOOL_META, type JarvisEvent } from "@jarvis/contracts";
import { createClientTools } from "@/lib/voice/elevenlabs/tools";
import { ElevenLabsVoiceSession, type ConversationControls } from "@/lib/voice/ElevenLabsVoiceSession";

function fakeControls(): ConversationControls & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {};
  const rec =
    (name: string, ret?: unknown) =>
    (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return ret;
    };
  return {
    calls,
    startSession: rec("startSession"),
    endSession: rec("endSession"),
    setMuted: rec("setMuted"),
    sendContextualUpdate: rec("sendContextualUpdate"),
    sendUserMessage: rec("sendUserMessage"),
    getInputVolume: () => 0.3,
    getOutputVolume: () => 0.7,
  } as never;
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createClientTools", () => {
  it("uses the session id of the event stream by default", async () => {
    const fetch = vi.fn(async (_u: string, _i?: RequestInit) => jsonResponse({ ok: true }));
    await createClientTools({ fetch, baseUrl: "http://gw", eventsUrl: "ws://gw/events?sessionId=stage-2" }).get_briefing!({});
    expect(fetch.mock.calls[0]![0]).toBe("http://gw/tools/get_briefing?sessionId=stage-2");
  });

  it("defines one client tool per gateway tool", () => {
    const tools = createClientTools({ fetch: vi.fn(), baseUrl: "http://gw" });
    expect(Object.keys(tools).sort()).toEqual(Object.keys(TOOL_META).sort());
  });

  it("posts the parameters to the gateway and returns the result as JSON string", async () => {
    const fetch = vi.fn(async () => jsonResponse({ ok: true, result: { taskId: "k1" } }));
    const tools = createClientTools({ fetch, baseUrl: "http://gw:8787" });
    const out = await tools.start_computer_task!({ instruction: "Termin eintragen" });
    expect(fetch).toHaveBeenCalledWith("http://gw:8787/tools/start_computer_task?sessionId=demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Termin eintragen" }),
    });
    expect(JSON.parse(out as string)).toEqual({ ok: true, result: { taskId: "k1" } });
  });

  it("turns gateway errors into an error result instead of throwing", async () => {
    const tools = createClientTools({ fetch: vi.fn(async () => jsonResponse({ detail: "Ungültige Tool-Argumente" }, 422)), baseUrl: "http://gw" });
    expect(JSON.parse((await tools.get_lead!({})) as string)).toEqual({ ok: false, error: "Ungültige Tool-Argumente" });
    const down = createClientTools({ fetch: vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))), baseUrl: "http://gw" });
    expect(JSON.parse((await down.get_briefing!({})) as string)).toMatchObject({ ok: false, error: expect.stringContaining("nicht erreichbar") });
  });
});

describe("ElevenLabsVoiceSession", () => {
  let applied: JarvisEvent[];
  let fetch: Mock<(url: string) => Promise<Response>>;
  let s: ElevenLabsVoiceSession;
  let c: ReturnType<typeof fakeControls>;

  beforeEach(() => {
    applied = [];
    fetch = vi.fn(async (_url: string) => jsonResponse({ signedUrl: "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&token=t" }));
    s = new ElevenLabsVoiceSession({ fetch, sessionUrl: "/api/elevenlabs/session", apply: (e) => applied.push(e), taskTitle: (id) => (id === "k-cu" ? "Termin für Dr. Weber eintragen" : undefined) });
    c = fakeControls();
    s.attach(c);
  });

  it("gets a signed URL from the server route and starts the SDK session with it", async () => {
    await s.connect();
    expect(fetch).toHaveBeenCalledWith("/api/elevenlabs/session");
    expect(c.calls.startSession![0]![0]).toEqual({ signedUrl: expect.stringContaining("elevenlabs.io"), connectionType: "websocket" });
    expect(s.state).toBe("connecting");
    s.onStatus("connected");
    expect(s.state).toBe("connected");
  });

  it("uses a WebRTC conversation token when the route returns one", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ conversationToken: "tok" }));
    await s.connect();
    expect(c.calls.startSession![0]![0]).toEqual({ conversationToken: "tok", connectionType: "webrtc" });
  });

  it("surfaces an asynchronous SDK connection failure instead of staying stuck connecting", async () => {
    const failure = Promise.reject(new Error("Microphone permission denied"));
    void failure.catch(() => {});
    c.startSession = () => failure;
    await s.connect();
    expect(s.state).toBe("error");
    expect(s.error).toContain("Mikrofon");
  });

  it("reports a missing key or agent from the route as an error, without starting", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: "ELEVENLABS_API_KEY fehlt" }, 500));
    await s.connect();
    expect(s.state).toBe("error");
    expect(s.error).toContain("ELEVENLABS_API_KEY");
    expect(c.calls.startSession).toBeUndefined();
  });

  it("does not connect twice on a double click", async () => {
    await Promise.all([s.connect(), s.connect()]);
    expect(c.calls.startSession).toHaveLength(1);
  });

  it("maps SDK mode changes to voice.state events (local only)", () => {
    s.onStatus("connected");
    s.onMode("speaking");
    s.onMode("listening");
    expect(applied.filter((e) => e.type === "voice.state").map((e) => (e.payload as { state: string }).state)).toEqual(["listening", "speaking", "listening"]);
  });

  it("sends a typed question with its visible app context only during an active session", () => {
    expect(s.ask("Wie geht es weiter?", "CRM: Müller GmbH")).toBe(false);
    expect(c.calls.sendUserMessage).toBeUndefined();
    s.onStatus("connected");
    expect(s.ask("  Wie geht es weiter?  ", "CRM: Müller GmbH")).toBe(true);
    expect(c.calls.sendContextualUpdate!.at(-1)).toEqual(["CRM: Müller GmbH"]);
    expect(c.calls.sendUserMessage).toEqual([["Wie geht es weiter?"]]);
    expect(s.ask("   ")).toBe(false);
    expect(c.calls.sendUserMessage).toHaveLength(1);
  });

  it("maps SDK messages to transcript.final with roles and estimated word timings for Jarvis", () => {
    s.onMessage({ message: "Was ist heute wichtig?", role: "user", event_id: 3 });
    s.onMessage({ message: "Drei Termine und zwei Mails.", role: "agent", event_id: 4 });
    const finals = applied.filter((e) => e.type === "transcript.final").map((e) => e.payload as { role: string; text: string; turnId: string; words?: unknown[] });
    expect(finals[0]).toMatchObject({ role: "user", text: "Was ist heute wichtig?", turnId: "el-0-3-user" });
    expect(finals[1]).toMatchObject({ role: "assistant", text: "Drei Termine und zwei Mails.", turnId: "el-0-4-agent" });
    expect(finals[1]!.words).toHaveLength(5);
  });

  it("measures first-audio latency from the user's message to Jarvis speaking", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    s.onMessage({ message: "Hallo", role: "user", event_id: 1 });
    vi.setSystemTime(10_640);
    s.onMode("speaking");
    vi.useRealTimers();
    const lat = applied.find((e) => e.type === "metrics.latency");
    expect(lat?.payload).toMatchObject({ firstAudioMs: 640 });
  });

  it("hands finished async tasks to the agent as contextual update so Jarvis says it", () => {
    s.onStatus("connected");
    s.handleHudEvent(makeEvent("task.done", { taskId: "k-cu", result: "Termin am Dienstag eingetragen" }));
    s.handleHudEvent(makeEvent("task.failed", { taskId: "k-x", error: "Zeitüberschreitung" }));
    expect(c.calls.sendContextualUpdate!.slice(1)).toEqual([
      ['Aufgabe "Termin für Dr. Weber eintragen" erledigt: Termin am Dienstag eingetragen'],
      ['Aufgabe "k-x" fehlgeschlagen: Zeitüberschreitung'],
    ]);
  });

  it("tells the agent about open approvals with their id so a spoken yes can resolve them", () => {
    s.onStatus("connected");
    s.handleHudEvent(
      makeEvent("approval.requested", { approvalId: "a-1", title: "Mail senden?", detail: "An: weber@praxis.example", risk: "medium" }),
    );
    expect(c.calls.sendContextualUpdate!.slice(1)).toEqual([
      ['Freigabe offen (approvalId a-1): Mail senden? – An: weber@praxis.example. Frag Leo; bei ausdrücklichem Ja oder Nein rufe resolve_approval mit dieser approvalId auf.'],
    ]);
  });

  it("does not send contextual updates while not connected", () => {
    s.handleHudEvent(makeEvent("task.done", { taskId: "k-cu", result: "ok" }));
    expect(c.calls.sendContextualUpdate).toBeUndefined();
  });

  it("reads levels from the SDK only while connected and ends the session on disconnect", async () => {
    expect(s.outputLevel()).toBe(0);
    s.onStatus("connected");
    expect(s.outputLevel()).toBe(0.7);
    expect(s.inputLevel()).toBe(0.3);
    s.mute(true);
    expect(s.inputLevel()).toBe(0);
    expect(c.calls.setMuted).toEqual([[true]]);
    s.mute(false);
    await s.disconnect();
    expect(c.calls.endSession).toHaveLength(1);
    expect(s.state).toBe("disconnected");
  });

  it("explains SDK errors in German (missing microphone, aborted session)", () => {
    s.onError("Not supported");
    expect(s.state).toBe("error");
    expect(s.error).toBe("Mikrofon nicht verfügbar oder nicht freigegeben");
    s.onError("Connection closed unexpectedly before session could be established.");
    expect(s.error).toBe("Verbindung zu ElevenLabs abgebrochen");
  });

  it("keeps a live call alive on non-fatal SDK errors (e.g. a failing client tool)", async () => {
    s.onStatus("connected");
    s.onError("Client tool execution failed");
    expect(s.state).toBe("connected");
    expect(s.error).toBe("Client tool execution failed");
    s.handleHudEvent(makeEvent("task.done", { taskId: "k-cu", result: "ok" }));
    expect(c.calls.sendContextualUpdate).toHaveLength(2); // session date + task
  });

  it("ends a lingering SDK conversation before retrying after an error", async () => {
    await s.connect();
    s.onStatus("disconnected");
    s.onError("Connection closed unexpectedly before session could be established.");
    expect(s.state).toBe("error");
    await s.connect();
    expect(c.calls.endSession).toHaveLength(1);
    expect(c.calls.startSession).toHaveLength(2);
  });

  it("gives every call its own turn ids, even when the SDK restarts event ids", () => {
    s.onStatus("connected");
    s.onMessage({ message: "Erster Call", role: "agent", event_id: 1 });
    s.onStatus("disconnected");
    s.onStatus("connected");
    s.onMessage({ message: "Zweiter Call", role: "agent", event_id: 1 });
    const ids = applied.filter((e) => e.type === "transcript.final").map((e) => (e.payload as { turnId: string }).turnId);
    expect(new Set(ids).size).toBe(2);
  });

  it("only mutes the SDK during a call and resets mute when the call ends", () => {
    c.setMuted = () => {
      throw new Error("No active conversation");
    };
    expect(() => s.mute(true)).not.toThrow();
    expect(s.muted).toBe(true);
    s.onStatus("connected");
    s.onStatus("disconnected");
    expect(s.muted).toBe(false);
  });

  it("goes back to idle when the SDK disconnects", () => {
    s.onStatus("connected");
    s.onStatus("disconnected");
    expect(s.state).toBe("disconnected");
    expect(applied.at(-1)).toMatchObject({ type: "voice.state", payload: { state: "idle" } });
  });
});

describe("ElevenLabsVoiceSession proactive speech", () => {
  let applied: JarvisEvent[];
  let s: ElevenLabsVoiceSession;
  let c: ReturnType<typeof fakeControls>;
  let micLevel: number;
  const nudges = () => (c.calls.sendUserMessage ?? []).map((a) => a[0] as string);
  const updates = () => (c.calls.sendContextualUpdate ?? []).map((a) => a[0] as string);
  const done = (taskId: string) => makeEvent("task.done", { taskId, result: "Termin eingetragen" });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T18:00:00+02:00"));
    applied = [];
    micLevel = 0;
    s = new ElevenLabsVoiceSession({ apply: (e) => applied.push(e), taskTitle: () => undefined });
    c = fakeControls();
    c.getInputVolume = () => micLevel;
    s.attach(c);
    s.onStatus("connected");
    s.onMode("speaking"); // greeting
    s.onMode("listening");
    vi.advanceTimersByTime(700);
  });
  afterEach(() => {
    s.onStatus("disconnected");
    vi.useRealTimers();
  });

  it("tells the agent the session date once on connect", () => {
    expect(updates()).toEqual([expect.stringMatching(/^Aktuelles Sitzungsdatum in Europe\/Berlin: Freitag, 9\. Oktober 2026 um 18:00/)]);
  });

  it("makes Jarvis announce a finished task without waiting for Leo", () => {
    s.handleHudEvent(done("k1"));
    expect(updates().at(-1)).toBe('Aufgabe "k1" erledigt: Termin eingetragen');
    expect(nudges()).toEqual([]); // context goes out at once, speech only at a turn boundary
    vi.advanceTimersByTime(1000);
    expect(nudges()).toEqual([expect.stringMatching(/^HUD-Systemmeldung: .*Aufgabenergebnisse/)]);
    expect(nudges()[0]).toContain("Leo");
  });

  it("does not talk over Jarvis: waits until he has finished speaking", () => {
    s.onMode("speaking");
    s.handleHudEvent(done("k1"));
    vi.advanceTimersByTime(5000);
    expect(nudges()).toEqual([]);
    s.onMode("listening");
    vi.advanceTimersByTime(300);
    expect(nudges()).toEqual([]); // short grace after his last word
    vi.advanceTimersByTime(1000);
    expect(nudges()).toHaveLength(1);
  });

  it("does not talk over Leo: waits until the microphone is quiet", () => {
    micLevel = 0.4;
    s.handleHudEvent(done("k1"));
    vi.advanceTimersByTime(3000);
    expect(nudges()).toEqual([]);
    micLevel = 0.01;
    vi.advanceTimersByTime(1500);
    expect(nudges()).toHaveLength(1);
  });

  it("also treats a positive VAD score as Leo speaking", () => {
    s.handleHudEvent(done("k1"));
    for (let i = 0; i < 8; i++) {
      s.onVadScore(0.9);
      vi.advanceTimersByTime(250);
    }
    expect(nudges()).toEqual([]);
    vi.advanceTimersByTime(1500);
    expect(nudges()).toHaveLength(1);
  });

  it("waits while Jarvis is still answering Leo's last question", () => {
    s.onMessage({ message: "Wie sieht morgen aus?", role: "user", event_id: 5 });
    s.handleHudEvent(done("k1"));
    vi.advanceTimersByTime(3000);
    expect(nudges()).toEqual([]);
    s.onMode("speaking");
    s.onMode("listening");
    vi.advanceTimersByTime(1500);
    expect(nudges()).toHaveLength(1);
  });

  it("sends one nudge for several results and never repeats a result", () => {
    s.handleHudEvent(done("k1"));
    s.handleHudEvent(done("k1")); // replayed event
    s.handleHudEvent(makeEvent("task.failed", { taskId: "k2", error: "Zeitüberschreitung" }));
    vi.advanceTimersByTime(1000);
    expect(updates().slice(1)).toHaveLength(2);
    expect(nudges()).toHaveLength(1);
    s.handleHudEvent(done("k1"));
    vi.advanceTimersByTime(20_000);
    expect(nudges()).toHaveLength(1);
  });

  it("does not nudge again before Jarvis has answered the last nudge", () => {
    s.handleHudEvent(done("k1"));
    vi.advanceTimersByTime(1000);
    s.handleHudEvent(done("k2"));
    vi.advanceTimersByTime(2000);
    expect(nudges()).toHaveLength(1);
    s.onMode("speaking");
    s.onMode("listening");
    vi.advanceTimersByTime(1500);
    expect(nudges()).toHaveLength(2);
  });

  it("asks Jarvis to speak about an open approval", () => {
    s.handleHudEvent(makeEvent("approval.requested", { approvalId: "a-1", title: "Mail senden?", detail: "An: weber@praxis.test", risk: "medium" }));
    vi.advanceTimersByTime(1000);
    expect(nudges()).toEqual([expect.stringContaining("offenen Freigaben")]);
  });

  it("interrupts politely for an urgent notice", () => {
    s.handleHudEvent(
      makeEvent("notice", { noticeId: "n1", severity: "urgent", title: "Dringende Mail von Dr. Anna Weber", detail: "Dringend: Rückruf heute?", entity: "mail", entityId: "M-061" }),
    );
    expect(updates().at(-1)).toBe("Dringender Hinweis (noticeId n1): Dringende Mail von Dr. Anna Weber – Dringend: Rückruf heute? (mail M-061)");
    vi.advanceTimersByTime(1000);
    expect(nudges()).toEqual([expect.stringMatching(/^HUD-Systemmeldung: .*dringend.*Entschuldige/s)]);
  });

  it("only adds info notices to the context", () => {
    s.handleHudEvent(makeEvent("notice", { noticeId: "n2", severity: "info", title: "Backup fertig", detail: "Alles gesichert" }));
    vi.advanceTimersByTime(5000);
    expect(updates().at(-1)).toBe("Hinweis (noticeId n2): Backup fertig – Alles gesichert");
    expect(nudges()).toEqual([]);
  });

  it("does not cut into the greeting right after connecting", () => {
    s.onStatus("disconnected");
    s.onStatus("connected");
    expect(nudges()).toEqual([]);
    s.handleHudEvent(done("k1"));
    vi.advanceTimersByTime(1000);
    expect(nudges()).toEqual([]);
    s.onMode("speaking"); // first_message
    s.onMode("listening");
    vi.advanceTimersByTime(1000);
    expect(nudges()).toHaveLength(1);
  });

  it("a late user transcript while Jarvis already speaks does not block nudges", () => {
    s.onMode("speaking");
    s.onMessage({ message: "Und morgen?", role: "user", event_id: 9 });
    s.onMode("listening");
    s.handleHudEvent(makeEvent("notice", { noticeId: "n9", severity: "urgent", title: "t", detail: "d" }));
    vi.advanceTimersByTime(1000);
    expect(nudges()).toHaveLength(1);
  });

  it("announces a reused id again after a while (looped rehearsal scenarios)", () => {
    s.handleHudEvent(done("k1"));
    vi.advanceTimersByTime(1000);
    s.onMode("speaking");
    s.onMode("listening");
    vi.advanceTimersByTime(61_000);
    s.handleHudEvent(done("k1"));
    expect(updates().slice(1)).toHaveLength(2);
  });

  it("drops a pending nudge when the call ends", () => {
    s.handleHudEvent(done("k1"));
    s.onStatus("disconnected");
    vi.advanceTimersByTime(5000);
    expect(nudges()).toEqual([]);
  });

  it("keeps the nudge itself out of the transcript", () => {
    s.onMessage({ message: "HUD-Systemmeldung: Bitte teile Leo jetzt …", role: "user", event_id: 7 });
    expect(applied.filter((e) => e.type === "transcript.final")).toEqual([]);
  });
});
