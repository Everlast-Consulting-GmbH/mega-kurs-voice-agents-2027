import { expect, it } from "vitest";
import { makeEvent } from "@jarvis/contracts";
import { initialState, reduce } from "@/lib/events/reducer";
import { hasLiveWork } from "@/lib/avatar/observe";
import { systemActivity } from "@/lib/avatar/systems";

it("a lost end event expires consistently in the camera and system indicators", () => {
  const now = Date.now();
  let hud = reduce(initialState, makeEvent("tool.started", { callId: "c", tool: "list_emails", args: {} }), now);
  expect(hasLiveWork(hud, now + 100)).toBe(true);
  expect(systemActivity(hud, now + 100).mail?.tone).toBe("active");
  expect(hasLiveWork(hud, now + 30_000)).toBe(false);
  expect(systemActivity(hud, now + 30_000).mail).toBeUndefined();
  hud = reduce(initialState, makeEvent("task.created", { taskId: "research", title: "Recherche", kind: "research" }), now);
  expect(hasLiveWork(hud, now + 100)).toBe(true);
  expect(hasLiveWork(hud, now + 120_000)).toBe(false);
  expect(systemActivity(hud, now + 120_000).web).toBeUndefined();
});

it("a tool evicted from the displayed history cannot keep the camera watching", () => {
  const now = Date.now();
  const hud = reduce(initialState, makeEvent("tool.started", { callId: "c", tool: "list_emails", args: {} }), now);
  expect(hasLiveWork({ ...hud, toolOrder: [] }, now + 100)).toBe(false);
});
