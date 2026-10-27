// One reduced ice-blue family for the whole control deck. Colour means something: amber only
// for work that is running right now, mint for just finished, rose for errors.

export const ICE = "#a9c8d8";
export const ICE_HI = "#dcecf5";
export const ICE_DIM = "#6f8fa2";
export const LINE = "rgba(169,200,216,0.16)";
export const LINE_HI = "rgba(169,200,216,0.42)";
export const PANEL_BG = "rgba(4,9,14,0.74)";
export const ACTIVE = "#ffb46e";
export const DONE = "#8fd6bf";
export const ERROR = "#ef8f94";
export const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

export type Tone = "idle" | "active" | "done" | "error";
export const toneColor = (tone: Tone) => (tone === "active" ? ACTIVE : tone === "done" ? DONE : tone === "error" ? ERROR : ICE);
export const logColor = (tone: "info" | "ok" | "warn" | "error") => (tone === "ok" ? DONE : tone === "warn" ? ACTIVE : tone === "error" ? ERROR : ICE);
