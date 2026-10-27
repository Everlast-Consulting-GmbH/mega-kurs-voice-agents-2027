// Stand-in for the orchestrator's event stream so the HUD can be built without a backend.
// Speaks the same protocol: WebSocket on ws://localhost:8787/events, JSON JarvisEvents.
//
//   pnpm mock-events                     # idle, trigger scenarios from the HUD or via HTTP
//   pnpm mock-events --scenario full-demo --loop
//   curl -X POST localhost:8787/play/computer-use
//
// Also answers the orchestrator's rehearsal endpoints the HUD's director keys use
// (R /demo/reset, N /demo/notice/urgent-mail, M /demo/run/mueller, C start_computer_task).
//
// Client -> server messages: any client JarvisEvent (approval.resolved) or
//   {"control":"play","scenario":"<name>"} | {"control":"stop"}
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { WebSocketServer, type WebSocket } from "ws";
import { PORTS, TOOL_META, parseEvent, safeParseEvent, type JarvisEvent } from "@jarvis/contracts";
import { SCENARIOS, type Step } from "./scenarios.js";
import { renderFrame } from "./frames.js";

// "pnpm mock-events -- --scenario x" forwards the "--" literally; ignore it.
const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    scenario: { type: "string" },
    loop: { type: "boolean", default: false },
    port: { type: "string", default: String(process.env.PORT ?? PORTS.orchestrator) },
  },
});
const port = Number(args.port);
const base = `http://localhost:${port}`;

const clients = new Set<WebSocket>();
let run: { cancel: () => void } | null = null;
let approvalWaiter: (() => void) | null = null;
// Approvals that arrive before the timeline reaches its waitFor step (fast clickers).
let earlyApprovals = 0;
let seq = 0;

function broadcast(ev: JarvisEvent) {
  const msg = JSON.stringify(ev);
  for (const c of clients) if (c.readyState === c.OPEN) c.send(msg);
}

function toEvent(step: Extract<Step, { type: string }>): JarvisEvent {
  const payload = { ...(step.payload as Record<string, unknown>) };
  if (step.type === "cu.frame" && typeof payload.imageUrl === "string" && payload.imageUrl.startsWith("/")) {
    payload.imageUrl = base + payload.imageUrl;
  }
  // Validate against the contract so a broken scenario fails loudly here, not in the HUD.
  return parseEvent({ id: `mock-${++seq}`, ts: Date.now(), sessionId: "demo", type: step.type, payload });
}

function play(name: string, loop = false) {
  const steps = SCENARIOS[name];
  if (!steps) throw new Error(`unknown scenario "${name}"`);
  run?.cancel();
  let cancelled = false;
  const timers = new Set<NodeJS.Timeout>();
  run = {
    cancel: () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      approvalWaiter = null;
    },
  };
  earlyApprovals = 0;
  const sorted = [...steps].sort((a, b) => a.at - b.at);
  console.log(`▶ ${name} (${sorted.length} steps)`);

  // Plays steps relative to a moving origin; a waitFor step shifts the origin by the time spent waiting.
  const playFrom = (index: number, origin: number) => {
    for (let i = index; i < sorted.length; i++) {
      const step = sorted[i]!;
      if ("waitFor" in step) {
        const t = setTimeout(() => {
          if (earlyApprovals > 0) {
            earlyApprovals -= 1;
            playFrom(i + 1, origin);
            return;
          }
          const startedWaiting = Date.now();
          const resume = () => {
            if (cancelled || approvalWaiter !== resume) return;
            approvalWaiter = null;
            clearTimeout(timeout);
            playFrom(i + 1, origin + (Date.now() - startedWaiting));
          };
          const timeout = setTimeout(resume, step.timeoutMs);
          timers.add(timeout);
          approvalWaiter = resume;
        }, Math.max(0, origin + step.at - Date.now()));
        timers.add(t);
        return;
      }
      const t = setTimeout(() => !cancelled && broadcast(toEvent(step)), Math.max(0, origin + step.at - Date.now()));
      timers.add(t);
    }
    const last = sorted[sorted.length - 1]!;
    const done = setTimeout(() => {
      if (cancelled) return;
      console.log(`■ ${name} done`);
      if (loop) play(name, true);
    }, Math.max(0, origin + last.at + 3000 - Date.now()));
    timers.add(done);
  };
  playFrom(0, Date.now());
}

const http = createServer((req, res) => {
  const url = new URL(req.url ?? "/", base);
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" }).end();
    return;
  }
  if (req.method === "POST" && (url.pathname.startsWith("/demo/") || url.pathname === "/tools/start_computer_task")) {
    const json = (code: number, body: unknown) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    if (url.pathname === "/demo/reset") {
      run?.cancel();
      return json(200, { ok: true });
    }
    if (url.pathname === "/demo/run/mueller") {
      play("multi-agent");
      return json(202, { ok: true, runId: "r-mueller" });
    }
    if (url.pathname === "/demo/notice/urgent-mail") {
      broadcast(parseEvent({ id: `mock-${++seq}`, ts: Date.now(), sessionId: "demo", type: "notice", payload: { noticeId: `n-mueller-${seq}`, severity: "urgent", title: "Thomas Müller", detail: "Unterschrift heute möglich?", entity: "mail", entityId: "M-101" } }));
      return json(200, { ok: true });
    }
    if (url.pathname === "/tools/start_computer_task") {
      play("computer-use");
      return json(200, { ok: true, result: { taskId: "k-cu" } });
    }
    return json(404, { detail: "unknown demo endpoint" });
  }
  const frame = url.pathname.match(/^\/frames\/(\d+)\.svg$/);
  if (frame) {
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    res.end(renderFrame(Number(frame[1])));
    return;
  }
  if (url.pathname === "/scenarios") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(Object.keys(SCENARIOS)));
    return;
  }
  if (url.pathname === "/tools") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(Object.entries(TOOL_META).map(([name, m]) => ({ name, ...m }))));
    return;
  }
  const playMatch = url.pathname.match(/^\/play\/([\w-]+)$/);
  if (playMatch && req.method === "POST") {
    try {
      play(playMatch[1]!);
      res.writeHead(202).end();
    } catch (e) {
      res.writeHead(404).end(String(e));
    }
    return;
  }
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, mock: true }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, path: "/events" });
wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`+ client (${clients.size})`);
  ws.on("close", () => clients.delete(ws));
  ws.on("message", (data) => {
    let msg: unknown;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    const m = msg as { control?: string; scenario?: string };
    if (m.control === "play" && m.scenario) {
      try {
        play(m.scenario);
      } catch (e) {
        console.warn(String(e));
      }
      return;
    }
    if (m.control === "stop") {
      run?.cancel();
      return;
    }
    const parsed = safeParseEvent(msg);
    if (!parsed.success) {
      console.warn("invalid client event", parsed.error.issues[0]);
      return;
    }
    broadcast(parsed.data); // echo so every HUD sees the resolution
    if (parsed.data.type === "approval.resolved") {
      if (approvalWaiter) approvalWaiter();
      else earlyApprovals += 1;
    }
  });
  if (args.scenario && clients.size === 1) play(args.scenario, args.loop);
});

http.listen(port, () => {
  console.log(`mock-events on ${base}  ws ${base.replace("http", "ws")}/events`);
  console.log(`scenarios: ${Object.keys(SCENARIOS).join(", ")}`);
});
