// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { makeEvent, TOOL_META } from "@jarvis/contracts";

// Mocked SDK: we only check what the bridge hands to useConversation and what it does with it.
const controls = {
  startSession: vi.fn(),
  endSession: vi.fn(),
  setMuted: vi.fn(),
  sendContextualUpdate: vi.fn(),
  sendUserMessage: vi.fn(),
  getInputVolume: () => 0,
  getOutputVolume: () => 0,
};
const useConversation = vi.fn((_opts: Record<string, unknown>) => controls);
vi.mock("@elevenlabs/react", () => ({
  useConversation: (o: Record<string, unknown>) => useConversation(o),
  ConversationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const { ElevenLabsBridge } = await import("@/components/ElevenLabsBridge");
const { ElevenLabsVoiceSession } = await import("@/lib/voice/ElevenLabsVoiceSession");
const { applyLocalEvent } = await import("@/lib/events/store");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ElevenLabsBridge", () => {
  it("configures useConversation with the default server location, all gateway tools and wires callbacks", async () => {
    const session = new ElevenLabsVoiceSession();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { items: [] } })));
    vi.stubGlobal("fetch", fetch);
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<ElevenLabsBridge session={session} />));

    const opts = useConversation.mock.calls.at(-1)![0] as Record<string, any>;
    expect(opts.serverLocation).toBeUndefined();
    expect(Object.keys(opts.clientTools).sort()).toEqual(Object.keys(TOOL_META).sort());

    // a client tool call goes to the orchestrator gateway
    const out = await opts.clientTools.list_leads({ limit: 3 });
    expect(fetch).toHaveBeenCalledWith("http://localhost:8787/tools/list_leads?sessionId=demo", expect.objectContaining({ method: "POST", body: '{"limit":3}' }));
    expect(JSON.parse(out)).toEqual({ ok: true, result: { items: [] } });

    // SDK status -> session state; task.done from the event stream -> contextual update
    act(() => opts.onStatusChange({ status: "connected" }));
    expect(session.state).toBe("connected");
    act(() => opts.onModeChange({ mode: "speaking" })); // greeting
    act(() => opts.onModeChange({ mode: "listening" }));
    act(() => applyLocalEvent(makeEvent("task.done", { taskId: "k-9", result: "Fertig" })));
    expect(controls.sendContextualUpdate).toHaveBeenCalledWith('Aufgabe "k-9" erledigt: Fertig');
    // ... and Jarvis is nudged to say it without waiting for Leo
    await act(async () => void (await new Promise((r) => setTimeout(r, 900))));
    expect(controls.sendUserMessage).toHaveBeenCalledWith(expect.stringMatching(/^HUD-Systemmeldung:/));
    // server VAD keeps the nudge back while Leo talks
    expect(typeof opts.onVadScore).toBe("function");

    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });
});
