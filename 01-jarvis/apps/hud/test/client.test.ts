import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { makeEvent, type JarvisEvent } from "@jarvis/contracts";
import { EventClient, backoffDelay, type ConnectionStatus } from "@/lib/events/client";

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((m: { data: unknown }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop() {
    this.readyState = 3;
    this.onerror?.();
    this.onclose?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
}

const last = () => FakeSocket.instances.at(-1)!;

function setup() {
  const events: JarvisEvent[] = [];
  const statuses: ConnectionStatus[] = [];
  const invalid: unknown[] = [];
  const client = new EventClient({
    url: "ws://test/events",
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    onEvent: (e) => events.push(e),
    onStatus: (s) => statuses.push(s),
    onInvalid: (raw) => invalid.push(raw),
    random: () => 0.5,
  });
  return { client, events, statuses, invalid };
}

describe("backoffDelay", () => {
  it("doubles from 500 ms and caps at 5 s", () => {
    const d = [1, 2, 3, 4, 5, 6, 10].map((a) => backoffDelay(a, { random: () => 0.5 }));
    expect(d).toEqual([500, 1000, 2000, 4000, 5000, 5000, 5000]);
  });
  it("adds at most ±20 % jitter", () => {
    expect(backoffDelay(1, { random: () => 0 })).toBe(400);
    expect(backoffDelay(1, { random: () => 1 })).toBe(600);
  });
});

describe("EventClient (fake socket)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
  });
  afterEach(() => vi.useRealTimers());

  it("reports connecting then open and delivers valid events", () => {
    const { client, events, statuses, invalid } = setup();
    client.start();
    expect(statuses.at(-1)).toMatchObject({ state: "connecting", attempt: 1 });
    last().open();
    expect(statuses.at(-1)).toMatchObject({ state: "open", attempt: 0 });

    const e = makeEvent("voice.state", { state: "speaking" });
    last().receive(e);
    last().receive("not json");
    last().receive({ type: "voice.state", payload: { state: "dancing" } });
    expect(events).toEqual([e]);
    expect(invalid).toHaveLength(2);
    expect(client.bytesReceived).toBe(JSON.stringify(e).length + "not json".length + JSON.stringify({ type: "voice.state", payload: { state: "dancing" } }).length);
  });

  it("reconnects with growing backoff and resets after a successful open", () => {
    const { client, statuses } = setup();
    client.start();
    last().drop();
    expect(statuses.at(-1)).toMatchObject({ state: "reconnecting", attempt: 1, retryInMs: 500 });
    expect(FakeSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(499);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);

    last().drop();
    expect(statuses.at(-1)).toMatchObject({ state: "reconnecting", attempt: 2, retryInMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(3);

    last().open();
    last().drop();
    expect(statuses.at(-1)).toMatchObject({ state: "reconnecting", attempt: 1, retryInMs: 500 });
    vi.advanceTimersByTime(500);
    last().drop();
    expect(statuses.at(-1)).toMatchObject({ state: "reconnecting", attempt: 2, retryInMs: 1000 });
  });

  it("does not schedule two reconnects when error and close both fire", () => {
    const { client } = setup();
    client.start();
    last().drop(); // fires onerror + onclose
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("stop() closes the socket and cancels reconnects", () => {
    const { client, statuses } = setup();
    client.start();
    last().open();
    client.stop();
    expect(statuses.at(-1)).toMatchObject({ state: "closed" });
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("send() only works while open", () => {
    const { client } = setup();
    client.start();
    expect(client.send({ control: "stop" })).toBe(false);
    last().open();
    expect(client.send({ control: "play", scenario: "x" })).toBe(true);
    expect(JSON.parse(last().sent[0]!)).toEqual({ control: "play", scenario: "x" });
  });
});

describe("EventClient against a real server that restarts", () => {
  let http: Server;
  let wss: WebSocketServer;

  async function listen(port = 0): Promise<number> {
    http = createServer();
    wss = new WebSocketServer({ server: http, path: "/events" });
    await new Promise<void>((r) => http.listen(port, "127.0.0.1", r));
    return (http.address() as AddressInfo).port;
  }
  async function shutdown() {
    for (const c of wss.clients) c.terminate();
    await new Promise<void>((r) => wss.close(() => r()));
    await new Promise<void>((r) => http.close(() => r()));
  }

  it("reconnects without reload after the server comes back", async () => {
    const port = await listen();
    const events: JarvisEvent[] = [];
    const states: string[] = [];
    const client = new EventClient({
      url: `ws://127.0.0.1:${port}/events`,
      onEvent: (e) => events.push(e),
      onStatus: (s) => states.push(s.state),
      backoff: { initialMs: 50, maxMs: 200 },
    });
    const opened = () => new Promise<void>((r) => wss.once("connection", () => setTimeout(r, 20)));

    let ready = opened();
    client.start();
    await ready;
    expect(states.at(-1)).toBe("open");

    await shutdown();
    await vi.waitFor(() => expect(states.at(-1)).toBe("reconnecting"));
    await new Promise((r) => setTimeout(r, 300)); // a few failed attempts while down

    await listen(port);
    ready = opened();
    await ready;
    await vi.waitFor(() => expect(states.at(-1)).toBe("open"));

    const e = makeEvent("voice.state", { state: "listening" });
    for (const c of wss.clients) c.send(JSON.stringify(e));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toEqual(e);

    client.stop();
    await shutdown();
  });
});
