import type { HudState, ToolCall, Task } from "@/lib/events/reducer";
import { TIMING } from "@/lib/derived";
import { TOOL_STALE_MS } from "@/lib/stage";

export const liveTool = (tool: ToolCall, now: number) => tool.status === "running" && now - tool.startedAt < TOOL_STALE_MS;
export const liveTask = (task: Task, now: number) => task.status === "running" && now - task.updatedAt < TIMING.staleMs;

/** Expired or evicted activity cannot leave Jarvis watching a completed operation forever. */
export function hasLiveWork(hud: HudState, now: number) {
  return (hud.voice.state === "acting" && now - hud.voice.since < TOOL_STALE_MS)
    || hud.toolOrder.some((id) => hud.tools[id] && liveTool(hud.tools[id]!, now))
    || hud.taskOrder.some((id) => hud.tasks[id]?.kind === "research" && liveTask(hud.tasks[id]!, now));
}
