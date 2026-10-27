"use client";
import { create } from "zustand";

// View-only state (not derived from events).
export type DesktopApp = "mail" | "crm" | "offer" | "calendar" | "chat";
export type Workspace = { app: DesktopApp; entityId?: string };
type Ui = {
  watchOpen: boolean;
  toggleWatch: () => void;
  workspace: Workspace | null;
  hiddenStageKey: string | null;
  openApp: (app: DesktopApp, entityId?: string) => void;
  closeApp: (stageKey?: string) => void;
  muted: boolean;
  devOpen: boolean;
  /** performance.now() of the intro (dots gather, greeting); 0 = none yet */
  introAt: number;
  /** explain bar (key D): the last turn in four plain steps */
  explain: boolean;
  toggleExplain: () => void;
  toggleMuted: () => void;
  toggleDev: () => void;
  startIntro: () => void;
  replayIntro: () => void;
  /** notices clicked away; the sphere stops blushing for them, too */
  dismissed: ReadonlySet<string>;
  dismissNotice: (id: string) => void;
  /** last director key, confirmed quietly in the explain bar */
  regie: { text: string; at: number } | null;
  setRegie: (text: string) => void;
};

/** Key handlers ignore typing in text fields. */
export const isTyping = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  return !!target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable || !!target.closest?.('[contenteditable="true"]'));
};

const storedMuted = () => typeof localStorage !== "undefined" && localStorage.getItem("hud.muted") === "1";

export const useUi = create<Ui>()((set) => ({
  watchOpen: false,
  toggleWatch: () => set((s) => ({ watchOpen: !s.watchOpen })),
  workspace: null,
  hiddenStageKey: null,
  openApp: (app, entityId) => set({ workspace: { app, ...(entityId ? { entityId } : {}) }, hiddenStageKey: null }),
  closeApp: (stageKey) => set({ workspace: null, hiddenStageKey: stageKey ?? null }),
  muted: storedMuted(),
  devOpen: false,
  introAt: 0,
  explain: false,
  toggleExplain: () => set((s) => ({ explain: !s.explain })),
  toggleMuted: () =>
    set((s) => {
      localStorage.setItem("hud.muted", s.muted ? "0" : "1");
      return { muted: !s.muted };
    }),
  toggleDev: () => set((s) => ({ devOpen: !s.devOpen })),
  // once per page; the dev panel can replay it
  startIntro: () => set((s) => (s.introAt ? {} : { introAt: performance.now() })),
  replayIntro: () => set({ introAt: performance.now() }),
  dismissed: new Set<string>(),
  dismissNotice: (id) => set((s) => ({ dismissed: new Set(s.dismissed).add(id) })),
  regie: null,
  setRegie: (text) => set({ regie: { text, at: Date.now() } }),
}));
