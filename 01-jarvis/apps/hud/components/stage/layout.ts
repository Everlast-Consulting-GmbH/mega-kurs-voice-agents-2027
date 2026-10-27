import type { Mode } from "@/lib/stage";
import { APP_ORDER, type AgentApp } from "@/lib/agents";

// Geometry of apps/hud/design/stage-layout-mockup.html on the 1920x1080 design canvas
// (1 cqw = 19.2 px). Jarvis is the speaker, beside him there is exactly one stage.

export const W = 1920;
export const H = 1080;
export const MARGIN_X = 58; // 3cqw

/** Spring for everything that moves between the four layouts (~600 ms, no overshoot to speak of). */
export const GLIDE = { type: "spring", duration: 0.6, bounce: 0.08 } as const;
export const EASE = [0.16, 1, 0.3, 1] as const;

export type OrbPose = { cx: number; cy: number; r: number };

/** The stage (Bild 2/3): right 4cqw, top 8.5cqw, bottom 8cqw or 17cqw above the explain bar. */
export function stageRect(explain: boolean) {
  const top = 163;
  const bottom = explain ? 326 : 154;
  return { left: W - 77 - 1075, top, width: 1075, height: H - top - bottom };
}

/** The agent window (Bild 4): as large as the real screen's aspect allows, right-aligned like the stage. */
export function cuWindow(frame: { width: number; height: number } | null, explain: boolean) {
  const bar = 46;
  const top = 118;
  const bottom = explain ? H - 326 - 52 : 908;
  const right = W - 77;
  const aspect = frame && frame.height ? frame.width / frame.height : 1.6;
  const bodyH = bottom - top - bar;
  const bodyW = Math.min(Math.round(bodyH * aspect), right - 326);
  return { left: right - bodyW, top, width: bodyW, height: Math.round(bodyW / aspect) + bar, bar };
}

export type Rect = { left: number; top: number; width: number; height: number };

// Bild A (agents-desktop-mockup.html): JARVIS + sphere + line in the left column, the app
// windows fill the rest. Rows end above the call bar.
const DESK = { left: 365, right: W - 38, top: 104, bottom: 958, gap: 20 };

/** Window rects for 1-4 agents (one window each, also two agents on the same app), in app order. */
export function agentRects(agents: Array<{ agentId: string; app: AgentApp }>): Record<string, Rect> {
  const list = agents
    .map((a, i) => ({ ...a, i }))
    .sort((a, b) => APP_ORDER.indexOf(a.app) - APP_ORDER.indexOf(b.app) || a.i - b.i)
    .slice(0, 4);
  const { left, right, top, bottom, gap } = DESK;
  const w = right - left;
  const h = bottom - top;
  const topH = Math.round((h - gap) * 0.54);
  const lowH = h - gap - topH;
  const row2 = top + topH + gap;
  const half = (w - gap) / 2;
  const slots: Rect[][] = [
    [],
    [{ left: left + w * 0.08, top, width: w * 0.84, height: h }],
    [
      { left, top, width: half, height: h },
      { left: left + half + gap, top, width: half, height: h },
    ],
    [
      { left, top, width: half, height: topH },
      { left: left + half + gap, top, width: half, height: topH },
      { left, top: row2, width: w, height: lowH },
    ],
    // the mockup: mail 39cqw | calendar 38cqw on top, chat 30cqw | crm 47cqw below
    [
      { left, top, width: Math.round(w * 0.507), height: topH },
      { left: left + Math.round(w * 0.507) + gap, top, width: w - Math.round(w * 0.507) - gap, height: topH },
      { left, top: row2, width: Math.round(w * 0.38), height: lowH },
      { left: left + Math.round(w * 0.38) + gap, top: row2, width: w - Math.round(w * 0.38) - gap, height: lowH },
    ],
  ];
  const rects = slots[list.length]!;
  return Object.fromEntries(list.map((a, i) => [a.agentId, roundRect(rects[i]!)]));
}

const roundRect = (r: Rect): Rect => ({ left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });

// Bild C: three app windows fan out above the sphere (mockup: 6/36/66 cqw, 28cqw wide, ±4°).
export const BRIEFING_WINDOWS: Array<{ app: "calendar" | "mail" | "crm"; rect: Rect; rotate: number }> = [
  { app: "calendar", rect: { left: 115, top: 150, width: 540, height: 372 }, rotate: -4 },
  { app: "mail", rect: { left: 690, top: 100, width: 540, height: 372 }, rotate: 0 },
  { app: "crm", rect: { left: 1265, top: 150, width: 540, height: 372 }, rotate: 4 },
];

export function orbPose(mode: Mode, explain: boolean, cuLeft: number): OrbPose {
  switch (mode) {
    case "agents":
      return { cx: 186, cy: 210, r: 82 };
    case "summary":
      return { cx: 960, cy: explain ? 270 : 330, r: explain ? 140 : 175 };
    case "desk":
      return { cx: 960, cy: explain ? 590 : 640, r: 112 };
    case "calm":
      return { cx: 960, cy: 376, r: 205 };
    case "stage":
      return { cx: 384, cy: explain ? 367 : 410, r: 173 };
    case "cu":
      return { cx: Math.round(cuLeft / 2), cy: explain ? 300 : 380, r: 106 };
    case "call":
      return { cx: 960, cy: 367, r: 230 };
  }
}

/** Where the speaker's line sits under the sphere. */
export function captionBox(mode: Mode, explain: boolean, cuLeft: number) {
  switch (mode) {
    case "agents":
      return { left: 30, width: 318, top: 340, size: 26 };
    case "summary":
      return { left: 288, width: W - 576, top: 712, size: 44 };
    case "desk":
      return { left: 384, width: W - 768, top: explain ? 720 : 790, size: 34 };
    case "calm":
      return { left: 288, width: W - 576, top: 712, size: 44 };
    case "stage":
      return { left: 58, width: 653, top: explain ? 572 : 626, size: 44 };
    case "cu": {
      const pose = orbPose("cu", explain, cuLeft);
      return { left: 40, width: cuLeft - 80, top: pose.cy + pose.r + 56, size: 30 };
    }
    case "call":
      return { left: 288, width: W - 576, top: 712, size: 44 };
  }
}
