import { describe, expect, it } from "vitest";
import { makeEvent, TOOL_META, type JarvisEvent } from "@jarvis/contracts";
import { initialState, reduce, type HudState } from "@/lib/events/reducer";
import { HEAD, PANELS, RECENT_MS, RING, activityFeed, timelineTicks, toolRing } from "@/lib/avatar/deck";

const t0 = 1_000_000;
function stateOf(events: Array<[number, JarvisEvent]>): HudState {
  return events.reduce((s, [t, e]) => reduce(s, e, t), initialState);
}
const started = (callId: string, tool: string) => makeEvent("tool.started", { callId, tool, args: {} });
const finished = (callId: string, tool: string, ok = true) => makeEvent("tool.finished", { callId, tool, ok, summary: `${tool} fertig`, durationMs: 120 });

describe("tool ring", () => {
  it("places every gateway tool exactly once on the arc around the head", () => {
    const spots = toolRing(initialState, t0);
    expect(spots.map((s) => s.tool).sort()).toEqual(Object.keys(TOOL_META).sort());
    for (const s of spots) {
      // between the deck columns and below the top frame
      expect(s.x).toBeGreaterThan(PANELS.systems.left + PANELS.systems.width + 100);
      expect(s.x).toBeLessThan(PANELS.network.left - 100);
      expect(s.y).toBeGreaterThan(100);
      expect(s.y).toBeLessThan(RING.y + RING.ry);
      expect(Math.hypot(s.x - HEAD.x, s.y - HEAD.y)).toBeGreaterThan(HEAD.ry);
    }
    expect(spots.every((s) => s.tone === "idle" && s.uses === 0)).toBe(true);
  });

  it("lights a running tool, counts its uses and lets a finished one glow briefly", () => {
    const s = stateOf([
      [t0, started("a", "list_emails")],
      [t0 + 100, finished("a", "list_emails")],
      [t0 + 200, started("b", "list_emails")],
      [t0 + 300, started("c", "move_deal")],
      [t0 + 400, finished("c", "move_deal", false)],
    ]);
    const at = (now: number) => Object.fromEntries(toolRing(s, now).map((x) => [x.tool, x]));
    const live = at(t0 + 500);
    expect(live.list_emails).toMatchObject({ tone: "active", uses: 2 });
    expect(live.move_deal).toMatchObject({ tone: "error", uses: 1 });
    expect(live.get_lead!.tone).toBe("idle");
    expect(at(t0 + 400 + RECENT_MS + 1).move_deal!.tone).toBe("idle");
  });
});

describe("activity feed", () => {
  it("shows running calls first, then the log newest first, within the limit", () => {
    const s = stateOf([
      [t0, started("a", "list_leads")],
      [t0 + 100, finished("a", "list_leads")],
      [t0 + 200, started("b", "list_events")],
    ]);
    const feed = activityFeed(s, t0 + 300);
    expect(feed[0]).toMatchObject({ live: true, text: "Termine läuft", meta: "list_events" });
    expect(feed[1]).toMatchObject({ live: false, text: "list_leads fertig", tone: "ok" });
    expect(activityFeed(s, t0 + 300, 1)).toHaveLength(1);
    expect(activityFeed(initialState, t0)).toEqual([]);
  });

  it("puts log entries of the last five minutes on the time axis", () => {
    const s = stateOf([
      [t0, started("a", "list_leads")],
      [t0 + 100, finished("a", "list_leads")],
    ]);
    expect(timelineTicks(s.log, t0 + 100)).toEqual([{ id: s.log[0]!.id, x: 1, tone: "ok" }]);
    expect(timelineTicks(s.log, t0 + 100 + 150_000)[0]!.x).toBeCloseTo(0.5, 5);
    expect(timelineTicks(s.log, t0 + 100 + 300_001)).toEqual([]);
  });
});
