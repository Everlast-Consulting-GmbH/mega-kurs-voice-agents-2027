import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent } from "@jarvis/contracts";
import { CU_INSTRUCTION, runRegie } from "@/lib/regie";
import { useHud } from "@/lib/events/store";
import { useUi } from "@/lib/ui";

const ok = () => Promise.resolve(new Response("{}", { status: 200 }));

describe("director keys", () => {
  beforeEach(() => {
    useHud.getState().reset();
    useUi.setState({ regie: null });
  });

  it("M starts the Müller run, N the notice, C computer use, all against the orchestrator", async () => {
    const fetcher = vi.fn(ok);
    expect(await runRegie("m", fetcher)).toBe("Müller-Lauf gestartet");
    await runRegie("N", fetcher);
    await runRegie("c", fetcher);
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([u]) => new URL(u).pathname)).toEqual(["/demo/run/mueller", "/demo/notice/urgent-mail", "/tools/start_computer_task"]);
    expect(calls.every(([u, init]) => u.includes("sessionId=") && init.method === "POST")).toBe(true);
    expect(JSON.parse(String(calls[2]![1].body))).toEqual({ instruction: CU_INSTRUCTION });
    expect(useUi.getState().regie?.text).toBe("Computer Use gestartet");
  });

  it("R resets the HUD even when the orchestrator is down, and says so", async () => {
    useHud.getState().apply(makeEvent("notice", { noticeId: "n", severity: "urgent", title: "x", detail: "y" }));
    const text = await runRegie("r", () => Promise.reject(new Error("down")));
    expect(text).toBe("Reset nur im HUD: Orchestrator nicht erreichbar");
    expect(useHud.getState().notices).toHaveLength(0);
  });

  it("says which key failed", async () => {
    expect(await runRegie("c", () => Promise.resolve(new Response("", { status: 500 })))).toBe("Computer Use fehlgeschlagen: HTTP 500");
  });

  it("other keys do nothing", async () => {
    const fetcher = vi.fn(ok);
    expect(await runRegie("x", fetcher)).toBe("");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
