import { makeEvent, type JarvisEvent } from "@jarvis/contracts";
import { applyLocalEvent, useHud } from "@/lib/events/store";
import { estimateWordTimings } from "@/lib/transcript";
import { DEMO_USER } from "@/lib/apps/fixtures";
import { BaseVoiceSession } from "./VoiceSession";

// Default voice layer (docs/DECISIONS.md, 2026-10-09): an ElevenLabs agent (global or
// EU-residency workspace, see ELEVENLABS_API_BASE). The SDK lives in components/ElevenLabsBridge (useConversation);
// this class adapts it to the HUD's VoiceSession interface and mirrors SDK state into the
// store as local events, so orb, transcript and terminal stay provider-independent.

/** The part of useConversation() this session needs. */
export type ConversationControls = {
  startSession: (options?: Record<string, unknown>) => Promise<unknown> | void;
  endSession: () => void;
  setMuted: (muted: boolean) => void;
  sendContextualUpdate: (text: string) => void;
  sendUserMessage: (text: string) => void;
  getInputVolume: () => number;
  getOutputVolume: () => number;
};

type Deps = {
  fetch: (url: string) => Promise<Response>;
  sessionUrl: string;
  apply: (e: JarvisEvent) => void;
  taskTitle: (taskId: string) => string | undefined;
};

const TRANSPORT = process.env.NEXT_PUBLIC_ELEVENLABS_TRANSPORT === "webrtc" ? "?transport=webrtc" : "";

const defaults: Deps = {
  fetch: (url) => globalThis.fetch(url),
  sessionUrl: `/api/elevenlabs/session${TRANSPORT}`,
  apply: applyLocalEvent,
  taskTitle: (id) => useHud.getState().tasks[id]?.title,
};

// Proactive speech: a contextual update alone never makes the agent talk, so after
// handing over a result we send a user message ("nudge") at the next safe turn boundary.
// Safe means: Jarvis is silent for a moment, Leo's microphone is quiet, and no answer to
// Leo or to an earlier nudge is still on its way.
const NUDGE = "HUD-Systemmeldung:";
const NUDGE_RESULTS = `${NUDGE} Bitte teile ${DEMO_USER} jetzt die noch nicht angesagten Aufgabenergebnisse oder offenen Freigaben aus dem Kontext mit. Keine neue Aktion, keine Freigabe.`;
const NUDGE_URGENT = `${NUDGE} Im Kontext steht ein dringender Hinweis. Unterbrich ${DEMO_USER} höflich, etwa mit „Entschuldige, gerade kam …“, und nenne ihn in einem Satz; danach kurz weitere noch nicht angesagte Ergebnisse. Keine neue Aktion, keine Freigabe.`;
const TICK_MS = 250;
const AFTER_AGENT_MS = 600; // grace after Jarvis' last word
const USER_QUIET_MS = 800; // Leo counts as speaking for this long after the last voice sample
const REPLY_TIMEOUT_MS = 10_000; // an answer that never comes must not block nudges forever
const REANNOUNCE_MS = 60_000; // same id again after this long is a new event (looped rehearsals)
const MIC_SPEECH_LEVEL = 0.08;
const VAD_SPEECH_SCORE = 0.5;

/** Same wording as agents/jarvis/examples/hud-bridge.mjs, so prompt and latency tests match. */
export function sessionDate(now = new Date()) {
  return `Aktuelles Sitzungsdatum in Europe/Berlin: ${new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "full",
    timeStyle: "short",
  }).format(now)}. Heute ist dieses Datum; Dienstag meint den nächsten Dienstag.`;
}

/** SDK errors are English and terse; the HUD shows them on stage. */
function humanizeError(message: string) {
  if (/not supported|permission|notallowed|getusermedia/i.test(message)) return "Mikrofon nicht verfügbar oder nicht freigegeben";
  if (/closed unexpectedly|before session/i.test(message)) return "Verbindung zu ElevenLabs abgebrochen";
  return message;
}

export class ElevenLabsVoiceSession extends BaseVoiceSession {
  readonly provider = "elevenlabs" as const;
  private controls: ConversationControls | null = null;
  private deps: Deps;
  private userSaidAt: number | null = null;
  private latencySeq = 0;
  private callSeq = 0; // SDK event ids restart per conversation
  private announced = new Map<string, number>(); // taskId / approvalId / noticeId -> handed over at
  private pending: "results" | "urgent" | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private agentSpeaking = false;
  private agentQuietSince = 0;
  private userVoiceAt = 0;
  private replyDueSince: number | null = null; // Leo or a nudge is waiting for Jarvis' answer

  constructor(deps: Partial<Deps> = {}) {
    super();
    this.deps = { ...defaults, ...deps };
  }

  /** Called by the bridge component with the live useConversation() controls. */
  attach(controls: ConversationControls | null) {
    this.controls = controls;
  }

  async connect() {
    if (this.state === "connecting" || this.state === "connected") return; // double click
    if (!this.controls) {
      this.set("error", "ElevenLabs-SDK nicht geladen");
      return;
    }
    // A failed start can leave the SDK holding a conversation; startSession would then no-op.
    if (this.state === "error") {
      try {
        this.controls.endSession();
      } catch {
        /* nothing to end */
      }
    }
    this.set("connecting");
    try {
      const res = await this.deps.fetch(this.deps.sessionUrl);
      const body = (await res.json().catch(() => ({}))) as { signedUrl?: string; conversationToken?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Session-Route: HTTP ${res.status}`);
      if (body.conversationToken) await this.controls.startSession({ conversationToken: body.conversationToken, connectionType: "webrtc" });
      else if (body.signedUrl) await this.controls.startSession({ signedUrl: body.signedUrl, connectionType: "websocket" });
      else throw new Error("Session-Route lieferte keine Zugangsdaten");
      // "connected" arrives through onStatus from the SDK
    } catch (e) {
      this.set("error", humanizeError(e instanceof Error ? e.message : String(e)));
    }
  }

  async disconnect() {
    this.controls?.endSession();
    this.toIdle();
  }

  mute(on: boolean) {
    if (this.state === "connected") {
      try {
        this.controls?.setMuted(on);
      } catch {
        /* SDK throws without an active conversation */
      }
    }
    super.mute(on);
  }

  inputLevel() {
    return this.state === "connected" && !this.muted && this.controls ? this.controls.getInputVolume() : 0;
  }

  outputLevel() {
    return this.state === "connected" && this.controls ? this.controls.getOutputVolume() : 0;
  }

  updateContext(context: string): boolean {
    if (this.state !== "connected" || !this.controls || !context.trim()) return false;
    try { this.controls.sendContextualUpdate(context); return true; } catch { return false; }
  }

  ask(message: string, context?: string): boolean {
    const text = message.trim();
    if (!text || this.state !== "connected" || !this.controls) return false;
    if (context) this.controls.sendContextualUpdate(context);
    this.controls.sendUserMessage(text);
    this.replyDueSince = this.userSaidAt = Date.now();
    return true;
  }

  // ---- SDK callbacks (wired by the bridge) ----

  onStatus(status: string) {
    if (status === "connected") {
      this.callSeq += 1;
      this.set("connected");
      this.deps.apply(makeEvent("voice.state", { state: "listening" }));
      this.controls?.sendContextualUpdate(sessionDate());
      // The greeting (first_message) is on its way; do not nudge into it.
      this.agentQuietSince = this.replyDueSince = Date.now();
    } else if (status === "connecting") this.set("connecting");
    else if (status === "disconnected" && this.state !== "error") this.toIdle();
  }

  onMode(mode: "speaking" | "listening") {
    this.agentSpeaking = mode === "speaking";
    if (mode === "speaking") this.replyDueSince = null;
    else this.agentQuietSince = Date.now();
    if (mode === "speaking" && this.userSaidAt !== null) {
      // first audio after the user's final transcript: our best client-side latency proxy
      this.deps.apply(makeEvent("metrics.latency", { turnId: `el-lat-${++this.latencySeq}`, firstAudioMs: Date.now() - this.userSaidAt }));
      this.userSaidAt = null;
    }
    this.deps.apply(makeEvent("voice.state", { state: mode }));
  }

  onMessage({ message, role, event_id }: { message: string; role: "user" | "agent"; event_id: number }) {
    if (!message.trim()) return;
    if (role === "user" && message.startsWith(NUDGE)) return; // our own nudge, not Leo
    if (role === "user") {
      this.userSaidAt = Date.now();
      // A transcript that lands after Jarvis started answering needs no further reply.
      if (!this.agentSpeaking) this.replyDueSince = this.userSaidAt;
    }
    this.deps.apply(
      makeEvent("transcript.final", {
        turnId: `el-${this.callSeq}-${event_id}-${role}`,
        role: role === "user" ? "user" : "assistant",
        text: message,
        ...(role === "agent" ? { words: estimateWordTimings(message) } : {}),
      }),
    );
  }

  /** Server VAD (only if "vad_score" is among the agent's client events). */
  onVadScore(score: number) {
    if (score >= VAD_SPEECH_SCORE) this.userVoiceAt = Date.now();
  }

  onError(message: string) {
    // During a live call the SDK also reports non-fatal problems (failing client tool,
    // server error event). Keep the call; only show the message.
    if (this.state === "connected") {
      this.error = humanizeError(message);
      this.emit();
      return;
    }
    this.set("error", humanizeError(message));
  }

  /**
   * Results of async tasks, open approvals and notices are handed to the agent as context at
   * once, and Jarvis is nudged to say them at the next safe turn boundary. Open approvals carry
   * their id; without it a spoken "Ja" could not be resolved.
   */
  handleHudEvent(e: JarvisEvent) {
    if (this.state !== "connected" || !this.controls) return;
    const key = e.type === "approval.requested" ? e.payload.approvalId : e.type === "notice" ? e.payload.noticeId : e.type === "task.done" || e.type === "task.failed" ? e.payload.taskId : null;
    const now = Date.now();
    if (key === null || now - (this.announced.get(key) ?? -Infinity) < REANNOUNCE_MS) return;
    this.announced.set(key, now);
    this.controls.sendContextualUpdate(this.describe(e));
    if (e.type === "notice" && e.payload.severity === "info") return;
    this.pending = e.type === "notice" || this.pending === "urgent" ? "urgent" : "results";
    this.scheduleNudge();
  }

  private describe(e: JarvisEvent): string {
    if (e.type === "approval.requested") {
      const p = e.payload;
      return `Freigabe offen (approvalId ${p.approvalId}): ${p.title} – ${p.detail}. Frag ${DEMO_USER}; bei ausdrücklichem Ja oder Nein rufe resolve_approval mit dieser approvalId auf.`;
    }
    if (e.type === "notice") {
      const p = e.payload;
      const ref = p.entity && p.entityId ? ` (${p.entity} ${p.entityId})` : "";
      return `${p.severity === "urgent" ? "Dringender Hinweis" : "Hinweis"} (noticeId ${p.noticeId}): ${p.title} – ${p.detail}${ref}`;
    }
    if (e.type === "task.done") return `Aufgabe "${this.deps.taskTitle(e.payload.taskId) ?? e.payload.taskId}" erledigt: ${e.payload.result}`;
    if (e.type === "task.failed") return `Aufgabe "${this.deps.taskTitle(e.payload.taskId) ?? e.payload.taskId}" fehlgeschlagen: ${e.payload.error}`;
    return "";
  }

  private scheduleNudge() {
    if (this.nudgeTimer || !this.pending) return;
    this.nudgeTimer = setTimeout(() => {
      this.nudgeTimer = null;
      this.tryNudge();
    }, TICK_MS);
  }

  /** Context alone cannot start speech; a user message can, but only between turns. */
  private tryNudge() {
    if (!this.pending || this.state !== "connected" || !this.controls) return;
    const now = Date.now();
    if (this.inputLevel() >= MIC_SPEECH_LEVEL) this.userVoiceAt = now;
    if (this.replyDueSince !== null && now - this.replyDueSince > REPLY_TIMEOUT_MS) this.replyDueSince = null;
    const safe =
      !this.agentSpeaking && now - this.agentQuietSince >= AFTER_AGENT_MS && now - this.userVoiceAt >= USER_QUIET_MS && this.replyDueSince === null;
    if (!safe) return this.scheduleNudge();
    this.controls.sendUserMessage(this.pending === "urgent" ? NUDGE_URGENT : NUDGE_RESULTS);
    this.pending = null;
    this.replyDueSince = now;
  }

  private clearNudge() {
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = null;
    this.pending = null;
    this.replyDueSince = null;
    this.agentSpeaking = false;
  }

  private toIdle() {
    const was = this.state;
    this.clearNudge();
    this.muted = false; // the SDK resets mute with the conversation
    this.set("disconnected");
    if (was === "connected" || was === "connecting") this.deps.apply(makeEvent("voice.state", { state: "idle" }));
  }
}
