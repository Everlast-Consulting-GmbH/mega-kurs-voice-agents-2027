"use client";
import { useUi } from "@/lib/ui";
import { useMailDemo } from "@/lib/apps/mailDemo";
import { useCrmDemo } from "@/lib/apps/crmDemo";
import { create } from "zustand";
import { makeEvent, type JarvisEvent } from "@jarvis/contracts";
import { EventClient, type ConnectionStatus } from "./client";
import { initialState, reduce, type HudState } from "./reducer";

export type HudStore = HudState & {
  connection: ConnectionStatus;
  apply: (e: JarvisEvent) => void;
  reset: () => void;
  setConnection: (c: ConnectionStatus) => void;
};

export const useHud = create<HudStore>()((set) => ({
  ...initialState,
  connection: { state: "closed", attempt: 0 },
  apply: (e) => set((s) => reduce(s, e)),
  reset: () => {
    useUi.getState().closeApp();
    useUi.setState({ watchOpen: false });
    useMailDemo.getState().actions.reset();
    useCrmDemo.getState().reset();
    set({ ...initialState });
  },
  setConnection: (connection) => set({ connection }),
}));

export const EVENTS_URL = process.env.NEXT_PUBLIC_EVENTS_URL ?? "ws://localhost:8787/events?sessionId=demo";

// Listeners for UI side effects (sounds, flashes) that should not live in state.
type Listener = (e: JarvisEvent) => void;
const listeners = new Set<Listener>();
export function onHudEvent(fn: Listener) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

let client: EventClient | null = null;

export function connectEvents() {
  if (client) return client;
  client = new EventClient({
    url: EVENTS_URL,
    onEvent: (e) => {
      useHud.getState().apply(e);
      listeners.forEach((l) => l(e));
    },
    onStatus: (c) => useHud.getState().setConnection(c),
    onInvalid: (raw, reason) => console.warn("[hud] dropped invalid event:", reason, raw),
  });
  client.start();
  return client;
}

/**
 * Applies an event that originates in the browser (e.g. the ElevenLabs SDK) exactly like
 * a streamed one: store + UI listeners. It is not sent to the orchestrator.
 */
export function applyLocalEvent(e: JarvisEvent) {
  useHud.getState().apply(e);
  listeners.forEach((l) => l(e));
}

export function disconnectEvents() {
  client?.stop();
  client = null;
}

/**
 * Approve or reject from the HUD. Only applied locally once it actually went out, so the
 * card never says "freigegeben" while the orchestrator is still waiting.
 */
export function resolveApproval(approvalId: string, approved: boolean): boolean {
  if (useHud.getState().approvals[approvalId]?.status !== "pending") return false;
  const e = makeEvent("approval.resolved", { approvalId, approved, via: "click" });
  if (!client?.send(e)) return false;
  useHud.getState().apply(e);
  listeners.forEach((l) => l(e));
  return true;
}

/** Dev panel: ask tools/mock-events to play a scenario. */
export function playScenario(scenario: string) {
  return client?.send({ control: "play", scenario }) ?? false;
}

export function stopScenario() {
  return client?.send({ control: "stop" }) ?? false;
}
