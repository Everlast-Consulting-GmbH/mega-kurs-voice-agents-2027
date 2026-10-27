"use client";
import { motion, AnimatePresence } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import { useHud } from "@/lib/events/store";
import { statusLine } from "@/lib/stage";
import { useNow } from "@/lib/hooks";
import { useUi } from "@/lib/ui";
import { BUILTIN_TOOLS } from "@/lib/tools";
import { AGENT_LOOK, agentDone, runAgents } from "@/lib/agents";
import type { Mode } from "@/lib/stage";
import { MARGIN_X } from "./layout";

/** Always there: JARVIS top left, a live status line in plain German top right (the agent chips while agents work). */
export function TopFrame({ mode }: { mode?: Mode }) {
  const now = useNow(250);
  const dismissed = useUi((s) => s.dismissed);
  const status = useHud(useShallow((s) => statusLine(s, s.connection.state, now, BUILTIN_TOOLS.length, dismissed)));
  const retryAt = useHud((s) => (s.connection.state === "reconnecting" ? s.connection.retryAt : null));
  const warn = status.tone === "warn";

  return (
    <motion.div
      className="pointer-events-none absolute flex items-center justify-between text-[20px]"
      style={{ top: 50, left: MARGIN_X, right: MARGIN_X, color: "#c9cdf0" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6, duration: 1.2 }}
    >
      <span className="font-semibold tracking-[0.25em] text-white">JARVIS</span>
      {mode === "agents" ? (
        <AgentChips now={now} />
      ) : (
      <span className="flex items-center tracking-[0.06em]" data-testid="status-line" data-tone={status.tone}>
        <span
          className="mr-3 inline-block h-[11px] w-[11px] rounded-full"
          style={{ background: warn ? "#fbbf24" : "#6ee7a8", boxShadow: `0 0 19px ${warn ? "#fbbf24" : "#6ee7a8"}`, transition: "background 0.6s" }}
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={status.text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }}>
            {status.text}
          </motion.span>
        </AnimatePresence>
        {retryAt !== null && <span className="ml-2 tabular-nums text-white/55">· {Math.max(0, Math.ceil((retryAt - now) / 1000))} s</span>}
      </span>
      )}
    </motion.div>
  );
}

/** Bild A: one chip per agent, "Mail · schreibt"; a check once it is done. */
function AgentChips({ now }: { now: number }) {
  const run = useHud((s) => s.run);
  if (!run) return null;
  return (
    <span className="flex items-center gap-[12px]" data-testid="agent-chips">
      {runAgents(run).map((a, i) => {
        const done = agentDone(run, a.agentId, now);
        const color = AGENT_LOOK[a.app].color;
        return (
          <motion.span
            key={a.agentId}
            data-testid="agent-chip"
            data-done={done || undefined}
            className="flex items-center gap-[9px] rounded-full px-[16px] py-[6px] text-[18px]"
            style={{ background: "rgba(10,12,28,0.6)", border: `1px solid ${done ? "rgba(110,231,168,0.45)" : "rgba(255,255,255,0.14)"}`, color: "#e4e6ff", transition: "border-color 0.5s" }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
          >
            {done ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6ee7a8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : (
              <i className="chip-pulse block h-[10px] w-[10px] rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
            )}
            {a.label}
          </motion.span>
        );
      })}
    </span>
  );
}
