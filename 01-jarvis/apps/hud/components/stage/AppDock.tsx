"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { useUi, type DesktopApp } from "@/lib/ui";
import { useAppData } from "@/lib/apps/data";
import { APP_NAMES, desktopLead } from "@/lib/apps/desktop";
import { runRegie } from "@/lib/regie";
import { sfx } from "@/lib/sound/sfx";
import { useHud } from "@/lib/events/store";
import { useNow } from "@/lib/hooks";
import { stageItem, type StageItem } from "@/lib/stage";

const LOOK: Record<Exclude<DesktopApp, "chat">, { color: string; path: string }> = {
  mail: { color: "#4fa5ff", path: "M3 6h18v12H3z M3 6l9 7 9-7" },
  crm: { color: "#ab8bfa", path: "M4 5h4v14H4z M10 8h4v11h-4z M16 3h4v16h-4z" },
  offer: { color: "#f8b565", path: "M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6" },
  calendar: { color: "#f77e9e", path: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2" },
};

/** Scenes that need the audience's eyes: an approval, agents at work, computer use. No app may cover them. */
export function stageLocked(item: StageItem | null | undefined): boolean {
  return item?.kind === "approval" || item?.kind === "cu" || (item?.kind === "run" && item.phase === "work");
}

/** Stage items that come back on their own (state-driven), so closing an app must never hide them. */
export function stageSticky(item: StageItem | null | undefined): boolean {
  return item?.kind === "cu" || item?.kind === "run" || (item?.kind === "approval" && item.approval.status === "pending");
}

export function AppDock() {
  const now = useNow(250);
  const dismissed = useUi((s) => s.dismissed);
  const locked = useHud((s) => stageLocked(stageItem(s, now, dismissed)));
  const workspace = useUi((s) => s.workspace);
  const openApp = useUi((s) => s.openApp);
  const leads = useAppData((s) => s.leads);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy || locked) return;
    setBusy(true);
    useUi.getState().closeApp();
    try { await runRegie("m"); } finally { setBusy(false); }
  };
  return (
    <motion.nav aria-label="Apps" data-testid="app-dock" className="absolute z-30 flex items-center gap-1 rounded-[18px] px-2 py-[6px] shadow-[0_12px_40px_rgba(0,0,0,0.35)]" style={{ left: 58, bottom: 38, ...(workspace ? { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", width: 286 } : {}), background: "rgba(4,9,14,0.86)", border: "1px solid rgba(169,200,216,0.2)" }}
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.5 }}>
      {(Object.keys(LOOK) as Array<keyof typeof LOOK>).map((app) => (
        <button key={app} type="button" data-testid={`dock-${app}`} title={`${APP_NAMES[app]} öffnen`} aria-label={`${APP_NAMES[app]} öffnen`} aria-pressed={workspace?.app === app} disabled={locked}
          onClick={() => { if (locked) return; openApp(app, app === "crm" ? desktopLead(leads)?.id : undefined); sfx.click(); }}
          className="group flex w-[76px] flex-col items-center gap-1 rounded-[13px] px-2 py-2 text-[13px] text-white/75 transition-colors hover:bg-white/[0.06] disabled:opacity-40" style={{ ...(workspace ? { width: "100%", paddingLeft: 0, paddingRight: 0 } : {}), background: workspace?.app === app ? "rgba(169,200,216,0.1)" : undefined }}>
          {/* dark tile, the app colour only in the line drawing: calm next to the ice-blue deck */}
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] transition-transform group-hover:-translate-y-1" style={{ color: LOOK[app].color, background: `radial-gradient(circle, ${LOOK[app].color}2e, rgba(8,15,21,0.9) 75%)`, border: `1px solid ${LOOK[app].color}55` }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"><path d={LOOK[app].path} /></svg>
          </span>
          {APP_NAMES[app]}<i className="h-[3px] w-[15px] rounded-full" style={{ ...(workspace ? { width: "100%", paddingLeft: 0, paddingRight: 0 } : {}), background: workspace?.app === app ? LOOK[app].color : "transparent" }} />
        </button>
      ))}
      <span className="mx-1 h-10 w-px" style={{ display: workspace ? "none" : undefined, background: "rgba(169,200,216,0.16)" }} />
      <button type="button" data-testid="dock-run" style={workspace ? { gridColumn: "1 / -1", width: "100%", flexDirection: "row", justifyContent: "center", padding: "4px 8px" } : undefined} disabled={busy || locked} onClick={() => void run()} className="flex w-[93px] flex-col items-center gap-2 rounded-[13px] px-2 py-3 text-[13px] text-[#ffc896] transition-colors hover:bg-white/[0.06] disabled:opacity-50">
        <span className="text-[25px]">✦</span>{busy ? "Startet …" : "Jarvis übernimmt"}
      </button>
    </motion.nav>
  );
}
