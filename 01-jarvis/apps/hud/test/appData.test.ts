import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent } from "@jarvis/contracts";
import { appDataOnEvent, FREEZE, freezeAppData, loadAppData, resetAppData, useAppData } from "@/lib/apps/data";
import { demoData } from "@/lib/apps/fixtures";

const live = demoData();
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("app data layer", () => {
  beforeEach(async () => {
    await resetAppData(() => Promise.reject(new Error("offline")));
  });

  it("falls back to the demo data when the mock world is not reachable", async () => {
    await loadAppData(undefined, () => Promise.reject(new Error("offline")));
    const s = useAppData.getState();
    expect(s.source).toEqual({ emails: "demo", events: "demo", leads: "demo", chat: "demo" });
    expect(s.emails.length).toBeGreaterThan(0);
  });

  it("takes live collections that validate and keeps demo data for the rest (per collection)", async () => {
    const fetcher = vi.fn((url: string) => {
      if (url.includes("/api/leads")) return json([{ ...live.leads[0]!, company: "Live GmbH" }]);
      if (url.includes("/api/emails")) return json([{ broken: true }]); // invalid -> ignored
      return json({ detail: "nicht da" }, 404);
    });
    await loadAppData(undefined, fetcher);
    const s = useAppData.getState();
    expect(s.leads.map((l) => l.company)).toEqual(["Live GmbH"]);
    expect(s.source).toMatchObject({ leads: "live", emails: "demo", events: "demo", chat: "demo" });
    expect(fetcher.mock.calls.map((c) => c[0]).some((u) => u.includes("/api/chat?channel=vertrieb"))).toBe(true);
  });

  it("does not refetch while agents work (frozen snapshot)", async () => {
    freezeAppData(true);
    const fetcher = vi.fn(() => json([]));
    await loadAppData(undefined, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    freezeAppData(false);
  });

  describe("freeze around a run", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    const frozen = () => useAppData.getState().frozen;

    it("a plan alone (e.g. rejected) never freezes; the first agent does", () => {
      appDataOnEvent(makeEvent("run.planned", { runId: "r", title: "t", steps: [], approvalId: "a" }));
      expect(frozen()).toBe(false);
      appDataOnEvent(makeEvent("agent.spawned", { runId: "r", agentId: "m", app: "mail", label: "Mail" }));
      expect(frozen()).toBe(true);
    });

    it("thaws a while after the summary, and a new run in that window re-freezes", () => {
      appDataOnEvent(makeEvent("agent.spawned", { runId: "r", agentId: "m", app: "mail", label: "Mail" }));
      appDataOnEvent(makeEvent("run.summary", { runId: "r", title: "t", tasks: 1, durationMs: 1000, humanMinutes: 1 }));
      vi.advanceTimersByTime(FREEZE.afterSummaryMs - 1000);
      appDataOnEvent(makeEvent("agent.spawned", { runId: "r2", agentId: "m", app: "mail", label: "Mail" }));
      vi.advanceTimersByTime(2000);
      expect(frozen()).toBe(true); // the first run's thaw did not fire into the second run
      vi.advanceTimersByTime(FREEZE.safetyMs);
      expect(frozen()).toBe(false); // a run without summary does not freeze for good
    });
  });
});
