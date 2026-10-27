import { safeParseEvent, type JarvisEvent } from "@jarvis/contracts";

// WebSocket client for the orchestrator event stream. Reconnects forever with
// exponential backoff (500 ms -> 5 s, ±20 % jitter) and reports its status so the
// HUD can show it. Every message is validated against the contract.

export type ConnectionStatus =
  | { state: "connecting"; attempt: number }
  | { state: "open"; attempt: 0; since: number }
  | { state: "reconnecting"; attempt: number; retryInMs: number; retryAt: number }
  | { state: "closed"; attempt: 0 };

type Backoff = { initialMs?: number; maxMs?: number; random?: () => number };

export function backoffDelay(attempt: number, { initialMs = 500, maxMs = 5000, random = Math.random }: Backoff = {}): number {
  const base = Math.min(maxMs, initialMs * 2 ** Math.max(0, attempt - 1));
  const jitter = 1 + (random() - 0.5) * 0.4;
  return Math.round(base * jitter);
}

export type EventClientOptions = {
  url: string;
  onEvent: (e: JarvisEvent) => void;
  onStatus?: (s: ConnectionStatus) => void;
  onInvalid?: (raw: unknown, reason: string) => void;
  WebSocketImpl?: typeof WebSocket;
  backoff?: { initialMs?: number; maxMs?: number };
  random?: () => number;
};

export class EventClient {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0; // consecutive failed connects, reset on open
  private stopped = true;
  /** Total payload characters received, for the HUD's throughput telemetry. */
  bytesReceived = 0;

  constructor(private readonly opts: EventClientOptions) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.failures = 0;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.opts.onStatus?.({ state: "closed", attempt: 0 });
  }

  /** Sends a JSON message (client event or mock control). Returns false if not connected. */
  send(msg: unknown): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  private connect() {
    this.opts.onStatus?.({ state: "connecting", attempt: this.failures + 1 });
    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    let ws: WebSocket;
    try {
      ws = new Impl(this.opts.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.failures = 0;
      this.opts.onStatus?.({ state: "open", attempt: 0, since: Date.now() });
    };
    ws.onmessage = (m: MessageEvent) => this.handle(m.data);
    ws.onerror = () => {
      /* onclose follows and handles the reconnect */
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // stale socket or stop()
      this.ws = null;
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.timer) return;
    const attempt = ++this.failures;
    const retryInMs = backoffDelay(attempt, { ...this.opts.backoff, random: this.opts.random });
    this.opts.onStatus?.({ state: "reconnecting", attempt, retryInMs, retryAt: Date.now() + retryInMs });
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.stopped) this.connect();
    }, retryInMs);
  }

  private handle(data: unknown) {
    this.bytesReceived += typeof data === "string" ? data.length : String(data).length;
    let raw: unknown;
    try {
      raw = JSON.parse(typeof data === "string" ? data : String(data));
    } catch {
      this.opts.onInvalid?.(data, "invalid JSON");
      return;
    }
    const parsed = safeParseEvent(raw);
    if (!parsed.success) {
      this.opts.onInvalid?.(raw, parsed.error.issues[0]?.message ?? "invalid event");
      return;
    }
    this.opts.onEvent(parsed.data);
  }
}
