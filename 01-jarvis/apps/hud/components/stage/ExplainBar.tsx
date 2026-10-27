"use client";
import { motion } from "motion/react";
import { useHud } from "@/lib/events/store";
import { explainTurn } from "@/lib/stage";
import { useNow } from "@/lib/hooks";
import { useUi } from "@/lib/ui";
import { EASE, MARGIN_X } from "./layout";

const PEACH = "#ffc9a3";

/** Key D: what Jarvis did in the last turn, in four plain steps (no developer numbers). */
export function ExplainBar() {
  const now = useNow(250);
  // re-rendered by the clock; the result is a fresh object, so it is not a store selector
  const e = explainTurn(useHud.getState(), now);
  const regie = useUi((s) => s.regie);
  const showRegie = regie && now - regie.at < 5000;
  return (
    <motion.div
      data-testid="explain-bar"
      className="absolute flex gap-[19px]"
      style={{ left: MARGIN_X, right: MARGIN_X, bottom: 125 }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {showRegie && (
        <motion.div data-testid="regie-confirm" className="absolute -top-[46px] left-0 text-[18px] tracking-[0.06em]" style={{ color: "#8f95c4" }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          Regie · {regie.text}
        </motion.div>
      )}
      {e.tiles.map((t, i) => (
        <div
          key={t.label}
          data-testid={`explain-${t.label}`}
          data-on={i === e.on || undefined}
          className="min-w-0 flex-1 rounded-[19px] px-[23px] py-[19px] text-[20px] leading-snug"
          style={{
            background: "rgba(10,12,28,0.6)",
            border: `1px solid ${i === e.on ? "rgba(255,201,163,0.6)" : "rgba(255,255,255,0.1)"}`,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: "#cfd3f5",
            transition: "border-color 0.5s",
          }}
        >
          <b className="mb-[8px] block text-[18px] font-medium tracking-[0.2em]" style={{ color: "#8f95c4" }}>
            {t.label}
          </b>
          <span className="line-clamp-2">
            {t.text}
            {t.accent && <span style={{ color: PEACH }}>{t.accent}</span>}
          </span>
        </div>
      ))}
    </motion.div>
  );
}
