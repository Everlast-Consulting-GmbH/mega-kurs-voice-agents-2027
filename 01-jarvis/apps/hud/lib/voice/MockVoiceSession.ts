import { useHud } from "@/lib/events/store";
import { BaseVoiceSession, type VoiceConnectionState } from "./VoiceSession";

// No audio at all: levels are synthesised from voice.state and transcript activity so
// the orb behaves as if someone were speaking. Default provider for HUD development.

/** Speech-like envelope: syllable rate ~5 Hz modulated by a slower phrase rhythm. */
export function speechEnvelope(t: number): number {
  const syllable = Math.abs(Math.sin(t * 15.7)) * 0.6 + Math.abs(Math.sin(t * 9.3 + 1.3)) * 0.4;
  const phrase = 0.55 + 0.45 * Math.sin(t * 1.9 + Math.sin(t * 0.7) * 2);
  return Math.min(1, Math.max(0, syllable * phrase * 0.95 + 0.05));
}

export class MockVoiceSession extends BaseVoiceSession {
  readonly provider = "mock" as const;
  state: VoiceConnectionState = "connected";

  async connect() {
    this.set("connected");
  }

  async disconnect() {
    this.set("disconnected");
  }

  private userSpeaking() {
    const { turns } = useHud.getState();
    const last = turns.at(-1);
    return !!last && last.role === "user" && !last.final && Date.now() - last.updatedAt < 900;
  }

  inputLevel() {
    if (this.muted || this.state !== "connected") return 0;
    const t = performance.now() / 1000;
    return this.userSpeaking() ? speechEnvelope(t * 1.1 + 3) * 0.9 : 0.02 + Math.abs(Math.sin(t * 0.8)) * 0.03;
  }

  outputLevel() {
    if (this.state !== "connected") return 0;
    const { voice } = useHud.getState();
    return voice.state === "speaking" ? speechEnvelope(performance.now() / 1000) : 0;
  }
}
