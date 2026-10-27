// The HUD knows exactly two things about the voice layer: the event stream and this
// interface. Implementations are chosen by NEXT_PUBLIC_VOICE_PROVIDER.

export type VoiceConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface VoiceSession {
  readonly provider: "elevenlabs" | "mock";
  readonly state: VoiceConnectionState;
  readonly muted: boolean;
  readonly error?: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  mute(on: boolean): void;
  /** A typed question about the app currently on screen; false when unavailable. */
  ask(message: string, context?: string): boolean;
  updateContext(context: string): boolean;
  /** Microphone level 0..1, cheap enough to call every animation frame. */
  inputLevel(): number;
  /** Jarvis voice level 0..1, cheap enough to call every animation frame. */
  outputLevel(): number;
  onChange(cb: () => void): () => void;
}

export abstract class BaseVoiceSession implements VoiceSession {
  abstract readonly provider: VoiceSession["provider"];
  state: VoiceConnectionState = "disconnected";
  muted = false;
  error?: string;
  private listeners = new Set<() => void>();

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract inputLevel(): number;
  abstract outputLevel(): number;

  ask(_message: string, _context?: string): boolean {
    return false;
  }

  updateContext(_context: string): boolean { return false; }

  mute(on: boolean) {
    this.muted = on;
    this.emit();
  }

  onChange(cb: () => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  protected set(state: VoiceConnectionState, error?: string) {
    this.state = state;
    this.error = error;
    this.emit();
  }

  protected emit() {
    this.listeners.forEach((l) => l());
  }
}
