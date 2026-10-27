"use client";
import { useSyncExternalStore } from "react";
import type { VoiceSession } from "./VoiceSession";
import { MockVoiceSession } from "./MockVoiceSession";
import { ElevenLabsVoiceSession } from "./ElevenLabsVoiceSession";

export type { VoiceSession } from "./VoiceSession";

// Default is ElevenLabs (docs/DECISIONS.md, 2026-10-09); "mock" for development without keys.
export const VOICE_PROVIDER = (process.env.NEXT_PUBLIC_VOICE_PROVIDER || "elevenlabs") as VoiceSession["provider"];

// The ElevenLabs session itself is SDK-free (the SDK sits in components/ElevenLabsBridge),
// so it is created right away.
const session: VoiceSession = VOICE_PROVIDER === "elevenlabs" ? new ElevenLabsVoiceSession() : new MockVoiceSession();

const notify = new Set<() => void>();
const forward = () => notify.forEach((n) => n());
session.onChange(forward);

/** Kept async so a provider with a lazily loaded SDK can be added without touching callers. */
export function loadVoiceSession(): Promise<VoiceSession> {
  return Promise.resolve(session);
}

/** Current session, synchronous; use for per-frame level reads. */
export const voice = () => session;

const subscribe = (cb: () => void) => {
  notify.add(cb);
  return () => void notify.delete(cb);
};

/** Re-renders on provider, connection or mute changes. */
export function useVoiceSession(): VoiceSession {
  useSyncExternalStore(
    subscribe,
    () => `${session.provider}:${session.state}:${session.muted}`,
    () => "mock:connected:false",
  );
  return session;
}
