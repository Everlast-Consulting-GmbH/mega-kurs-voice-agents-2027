"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { makeEvent } from "@jarvis/contracts";
import { EVENTS_URL, playScenario, stopScenario, useHud } from "@/lib/events/store";
import { useUi } from "@/lib/ui";
import { ORCHESTRATOR_URL, SESSION_ID } from "@/lib/voice/elevenlabs/tools";

const FALLBACK = ["briefing-apps", "multi-agent", "drehbuch", "boot-briefing", "leads-widget", "computer-use", "approval-call", "tool-learned", "full-demo"];

/** Hidden dev panel (` key): play mock scenarios, reset, replay the intro. */
export function DevPanel() {
  const open = useUi((s) => s.devOpen);
  const replayIntro = useUi((s) => s.replayIntro);
  const reset = useHud((s) => s.reset);
  const conn = useHud((s) => s.connection.state);
  const [scenarios, setScenarios] = useState(FALLBACK);
  const [lastPlayed, setLastPlayed] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const http = EVENTS_URL.replace(/^ws/, "http").replace(/\/events.*$/, "");
    fetch(`${http}/scenarios`)
      .then((r) => (r.ok ? r.json() : FALLBACK))
      .then((s: string[]) => Array.isArray(s) && s.length && setScenarios(s))
      .catch(() => {});
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="dev-panel"
          className="absolute bottom-12 left-6 w-[400px] rounded-[22px] p-5"
          style={{ zIndex: 200, background: "rgba(12,14,32,0.82)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(14px)" }}
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 16, filter: "blur(6px)" }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-4 flex items-baseline justify-between">
            <span className="text-[15px] font-medium text-white/90">Dev-Panel</span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-white/45">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: conn === "open" ? "#9be7b4" : "#ff8a80" }} />
              {conn === "open" ? "verbunden" : conn}
            </span>
          </div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-white/40">Szenarien</div>
          <div className="grid grid-cols-2 gap-1.5">
            {scenarios.map((s) => (
              <button
                key={s}
                type="button"
                data-testid={`play-${s}`}
                onClick={() => {
                  playScenario(s);
                  setLastPlayed(s);
                }}
                className={`rounded-xl px-3 py-2 text-left text-[12.5px] transition-colors ${lastPlayed === s ? "bg-white/20 text-white" : "bg-white/[0.07] text-white/75 hover:bg-white/12 hover:text-white"}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="mb-2 mt-4 text-[11px] uppercase tracking-[0.14em] text-white/40">Steuerung</div>
          <div className="flex flex-wrap gap-1.5">
            <DevButton onClick={() => stopScenario()}>Stopp</DevButton>
            <DevButton onClick={() => reset()}>Leeren</DevButton>
            <DevButton onClick={() => replayIntro()}>Intro abspielen</DevButton>
            <DevButton onClick={() => simulateParallelTask()}>Parallele Aufgabe</DevButton>
            <DevButton testId="notice-urgent-mail" onClick={() => void triggerUrgentMail().then(setNoticeError)}>
              Dringende Mail
            </DevButton>
          </div>
          {noticeError && <div className="mt-2 text-[12px] text-[#ff8a80]">{noticeError}</div>}
          <div className="mt-4 text-[11.5px] leading-relaxed text-white/40">
            D Erklär-Leiste · T Ton · ` Panel · ↵/Esc Freigabe
            <br />
            Regie: R Reset · N Mitteilung · M Müller-Lauf · C Computer Use
            <br />
            „Parallele Aufgabe“ ist eine lokale Simulation (nur HUD).
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DevButton({ onClick, children, testId }: { onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick} className="rounded-full bg-white/[0.07] px-3 py-1.5 text-[12px] text-white/75 transition-colors hover:bg-white/14 hover:text-white">
      {children}
    </button>
  );
}

let simSeq = 0;
/** Local-only research task, to rehearse a parallel task while another one runs. */
export function simulateParallelTask() {
  const apply = useHud.getState().apply;
  const taskId = `sim-${++simSeq}`;
  const steps = ["Sammle Quellen", "Werte aus", "Fasse zusammen"];
  apply(makeEvent("task.created", { taskId, title: "Parallele Recherche (Simulation)", kind: "research" }));
  steps.forEach((message, i) => setTimeout(() => apply(makeEvent("task.progress", { taskId, message, step: i + 1, totalSteps: steps.length })), 1500 + i * 3500));
  setTimeout(() => apply(makeEvent("task.done", { taskId, result: "Simulation abgeschlossen" })), 1500 + steps.length * 3500);
}

/** On stage: the orchestrator files a new urgent mail and emits notice + ui.focus. */
export async function triggerUrgentMail(fetcher: typeof fetch = (i, init) => globalThis.fetch(i, init)): Promise<string | null> {
  try {
    const res = await fetcher(`${ORCHESTRATOR_URL}/demo/notice/urgent-mail?sessionId=${encodeURIComponent(SESSION_ID)}`, { method: "POST" });
    return res.ok ? null : `Hinweis fehlgeschlagen: HTTP ${res.status}`;
  } catch {
    return "Orchestrator nicht erreichbar";
  }
}
