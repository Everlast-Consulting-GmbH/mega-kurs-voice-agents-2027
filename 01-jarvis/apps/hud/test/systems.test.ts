import { describe, expect, it } from "vitest";
import { makeEvent, type JarvisEvent } from "@jarvis/contracts";
import { demoData } from "@/lib/apps/fixtures";
import { initialState, reduce, type HudState } from "@/lib/events/reducer";
import { HEAD, PANELS, headAnchor } from "@/lib/avatar/deck";
import { BODY, RECENT_MS, linkPath, summarizeSystems, systemActivity, SYSTEM_ORDER, type SystemInput } from "@/lib/avatar/systems";

const now = Date.parse("2026-10-14T09:00:00Z");
const demo = { emails: "demo", events: "demo", leads: "demo", chat: "demo" } as const;

function stateOf(events: Array<[number, JarvisEvent]>): HudState {
  return events.reduce((s, [t, e]) => reduce(s, e, t), initialState);
}
function input(hud: HudState = initialState, source: SystemInput["source"] = demo): SystemInput {
  return { ...demoData(), source, hud, now };
}
const byId = (xs: ReturnType<typeof summarizeSystems>) => Object.fromEntries(xs.map((n) => [n.id, n]));

describe("summarizeSystems", () => {
  it("returns the six systems in layout order, anchored on the inner edge of their deck rows", () => {
    const nodes = summarizeSystems(input());
    expect(nodes.map((n) => n.id)).toEqual(SYSTEM_ORDER);
    const left = nodes.filter((n) => n.side === "left");
    const right = nodes.filter((n) => n.side === "right");
    expect(left.map((n) => n.id)).toEqual(["mail", "crm", "calendar"]);
    expect(left.map((n) => n.x)).toEqual(Array(3).fill(PANELS.systems.left + PANELS.systems.width));
    expect(right.map((n) => n.x)).toEqual(Array(3).fill(PANELS.reach.left));
    // every anchor sits inside its panel, rows top to bottom
    for (const [list, box] of [[left, PANELS.systems], [right, PANELS.reach]] as const) {
      for (const n of list) {
        expect(n.y).toBeGreaterThan(box.top);
        expect(n.y).toBeLessThan(box.top + box.height);
      }
      expect([...list].sort((a, b) => a.y - b.y)).toEqual(list);
    }
  });

  it("gauges only what can be counted: unread mail, open leads, upcoming events", () => {
    const data = demoData();
    const n = byId(summarizeSystems(input()));
    const inbox = data.emails.filter((m) => m.folder === "inbox");
    expect(n.mail!.gauge).toEqual({ value: inbox.filter((m) => m.unread).length, total: inbox.length });
    expect(n.crm!.gauge!.total).toBe(data.leads.length);
    expect(n.crm!.gauge!.value).toBe(data.leads.filter((l) => l.status !== "gewonnen" && l.status !== "verloren").length);
    expect(n.calendar!.gauge!.total).toBe(data.events.length);
    for (const id of ["team", "computer", "web"]) expect(n[id]!.gauge).toBeNull();
  });

  it("counts from the app data and says honestly where it comes from", () => {
    const data = demoData();
    const n = byId(summarizeSystems(input()));
    const unread = data.emails.filter((m) => m.folder === "inbox" && m.unread).length;
    expect(n.mail!.metric).toContain(String(unread));
    expect(n.crm!.metric).toContain(`${data.leads.length} Leads`);
    for (const id of ["mail", "crm", "calendar", "team"]) expect(n[id]!.source).toBe("Demo-Daten");
    expect(n.web!.source).toBe("Nur auf Auftrag");
    expect(JSON.stringify(n)).not.toMatch(/internet verbunden|live/i);
  });

  it("calls a reachable mock world a test world, never production", () => {
    const n = byId(summarizeSystems(input(initialState, { emails: "live", events: "demo", leads: "live", chat: "live" })));
    expect(n.mail!.source).toBe("Testwelt verbunden");
    expect(n.calendar!.source).toBe("Demo-Daten");
  });

  it("links open apps for mail, crm and calendar; team, computer and web show help", () => {
    const n = byId(summarizeSystems(input()));
    expect([n.mail!.app, n.crm!.app, n.calendar!.app]).toEqual(["mail", "crm", "calendar"]);
    expect([n.team!.app, n.computer!.app, n.web!.app]).toEqual([null, null, null]);
  });

  it("starts idle", () => {
    expect(summarizeSystems(input()).every((n) => n.tone === "idle" && n.activity === null)).toBe(true);
  });
});

describe("systemActivity", () => {
  it("lights the system a running tool touches, and briefly after it finished", () => {
    const started = makeEvent("tool.started", { callId: "c1", tool: "list_emails", args: {} });
    const running = stateOf([[now - 100, started]]);
    expect(systemActivity(running, now).mail?.tone).toBe("active");
    const done = stateOf([[now - 500, started], [now - 200, makeEvent("tool.finished", { callId: "c1", tool: "list_emails", ok: true, summary: "3 Mails", durationMs: 300 })]]);
    expect(systemActivity(done, now).mail?.tone).toBe("done");
    expect(systemActivity(done, now + RECENT_MS).mail).toBeUndefined();
  });

  it("maps agents of a run to their systems (chat to Team, praxis to Computer)", () => {
    const s = stateOf([
      [now - 50, makeEvent("agent.spawned", { runId: "r", agentId: "a1", app: "chat", label: "Slack" })],
      [now - 40, makeEvent("agent.spawned", { runId: "r", agentId: "a2", app: "crm", label: "CRM" })],
    ]);
    const hits = systemActivity(s, now);
    expect(hits.team?.tone).toBe("active");
    expect(hits.crm?.tone).toBe("active");
    expect(hits.mail).toBeUndefined();
  });

  it("counts only research tasks as web work and computer-use tasks as computer work", () => {
    const s = stateOf([
      [now - 10, makeEvent("task.created", { taskId: "t1", title: "Recherche", kind: "research" })],
      [now - 10, makeEvent("task.created", { taskId: "t2", title: "Praxis", kind: "computer_use" })],
    ]);
    const hits = systemActivity(s, now);
    expect(hits.web?.activity).toBe("Recherche läuft");
    expect(hits.computer?.activity).toBe("Computer Use läuft");
  });
});

describe("linkPath", () => {
  it("starts at the body centre by default and ends on the node's anchor", () => {
    expect(linkPath({ x: 412, y: 192, side: "left" })).toMatch(new RegExp(`^M ${BODY.x} ${BODY.y} .* 412 192$`));
    expect(linkPath({ x: 1508, y: 636, side: "right" })).toMatch(/ 1508 636$/);
  });

  it("can start on the head outline in the close-up", () => {
    const node = { x: 412, y: 192, side: "left" as const };
    const from = headAnchor(node);
    expect(linkPath(node, from)).toMatch(new RegExp(`^M ${from.x} ${from.y} `));
    // the head anchor lies on the outline, on the side facing the node
    expect(((from.x - HEAD.x) / HEAD.rx) ** 2 + ((from.y - HEAD.y) / HEAD.ry) ** 2).toBeCloseTo(1, 1);
    expect(from.x).toBeLessThan(HEAD.x);
  });
});
