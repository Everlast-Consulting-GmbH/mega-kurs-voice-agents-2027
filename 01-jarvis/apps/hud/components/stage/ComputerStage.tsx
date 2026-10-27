"use client";
import { motion, AnimatePresence } from "motion/react";
import { useHud } from "@/lib/events/store";
import type { CuAction } from "@/lib/events/reducer";
import { appName, cuCaption, progressStrokes } from "@/lib/stage";
import { EASE, GLIDE, cuWindow } from "./layout";
import { TitleBar, WINDOW_RADIUS } from "../apps/WindowShell";

const PEACH = "#ffc9a3";
const RING = "rgba(124,108,240,0.75)";

// Bild 4: the agent's real screen is the stage, in a light macOS window. Under it one plain
// sentence of what happens now, plus progress strokes. A quiet ring marks the click target.

export function ComputerStage({ phase, explain }: { phase: "takeover" | "done"; explain: boolean }) {
  const cu = useHud((s) => s.cu);
  const task = useHud((s) => (s.cu.taskId ? s.tasks[s.cu.taskId] : undefined));
  const win = cuWindow(cu.frame, explain);
  const last = cu.actions.at(-1);
  const total = last?.totalSteps ?? task?.totalSteps ?? 0;
  const strokes = progressStrokes(phase === "done" ? total : (last?.step ?? task?.step ?? 0), total);
  const failed = task?.status === "failed";

  return (
    <>
      <motion.div
        data-testid="stage-computer"
        data-phase={phase}
        className="absolute overflow-hidden"
        style={{ borderRadius: WINDOW_RADIUS, background: "#f6f6fb", boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.28)" }}
        initial={{ opacity: 0, scale: 0.97, left: win.left, top: win.top, width: win.width, height: win.height }}
        animate={{ opacity: 1, scale: 1, left: win.left, top: win.top, width: win.width, height: win.height }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.45, ease: EASE } }}
        transition={GLIDE}
      >
        <TitleBar height={win.bar} title={[appName(task?.title), task?.title ?? "Agent-Bildschirm"].filter((x) => x !== "den Computer").join(" · ")} />
        <div className="relative" style={{ height: win.height - win.bar }}>
          {cu.frame && (
            <AnimatePresence initial={false}>
              <motion.img key={cu.frame.url} src={cu.frame.url} alt="Agent-Bildschirm" className="absolute inset-0 h-full w-full object-contain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} draggable={false} />
            </AnimatePresence>
          )}
          {cu.frame && phase === "takeover" && <TargetRing width={cu.frame.width} height={cu.frame.height} action={last} />}
        </div>
      </motion.div>

      <motion.div
        data-testid="stage-computer-step"
        className="absolute flex items-center justify-between gap-8"
        initial={{ opacity: 0, left: win.left, width: win.width, top: win.top + win.height + 16 }}
        animate={{ opacity: 1, left: win.left, width: win.width, top: win.top + win.height + 16 }}
        exit={{ opacity: 0 }}
        transition={GLIDE}
      >
        <div className="relative h-[36px] min-w-0 flex-1">
          <AnimatePresence initial={false}>
          <motion.span key={phase === "done" ? "done" : (last?.seq ?? 0)} className="absolute inset-0 truncate text-[24px] leading-[36px] text-white" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3 }}>
            {phase === "done" ? (
              <>
                <span style={{ color: PEACH }}>{failed ? "Fehlgeschlagen" : "Erledigt"}</span>
                {` · ${(failed ? task?.error : task?.result) ?? ""}`}
              </>
            ) : last ? (
              cuCaption(last.caption, last.text).map((p, i) =>
                p.em ? (
                  <b key={i} className="font-semibold" style={{ color: PEACH }}>
                    {p.text}
                  </b>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )
            ) : (
              "Öffnet die Anwendung …"
            )}
          </motion.span>
          </AnimatePresence>
        </div>
        {strokes.shown > 0 && phase === "takeover" && (
          <span className="flex shrink-0 gap-[10px]" data-testid="stage-computer-progress" data-step={last?.step ?? task?.step ?? 0} data-total={total}>
            {Array.from({ length: strokes.shown }, (_, i) => (
              <i key={i} className="block h-[7px] w-[42px] rounded-full" style={{ background: i < strokes.on ? PEACH : "rgba(255,255,255,0.2)", transition: "background 0.4s" }} />
            ))}
          </span>
        )}
      </motion.div>
    </>
  );
}

/** A quiet ring on the element the agent is about to use (frame pixel coordinates). */
function TargetRing({ width, height, action }: { width: number; height: number; action: CuAction | undefined }) {
  const t = action?.target;
  const full = t && t.width >= width * 0.9 && t.height >= height * 0.9; // screenshot / wait: no target
  const x = t ? t.x + t.width / 2 : action?.x;
  const y = t ? t.y + t.height / 2 : action?.y;
  if (!action || full || x === undefined || y === undefined) return null;
  const r = Math.max(30, Math.min(64, (t ? Math.max(t.width, t.height) / 2 : 24) + 12));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 h-full w-full" data-testid="stage-computer-ring">
      <AnimatePresence>
        <motion.circle
          key={action.seq}
          cx={x}
          cy={y}
          r={r}
          fill="rgba(124,108,240,0.06)"
          stroke={RING}
          strokeWidth={2.5}
          initial={{ opacity: 0, scale: 1.35 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      </AnimatePresence>
    </svg>
  );
}
