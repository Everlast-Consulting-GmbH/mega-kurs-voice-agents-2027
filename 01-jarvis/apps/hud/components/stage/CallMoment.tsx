"use client";
import { motion, AnimatePresence } from "motion/react";
import { useHud } from "@/lib/events/store";
import { CALL_LABEL, callSentence, liveCall, maskNumber } from "@/lib/stage";
import { fmtDuration, useNow } from "@/lib/hooks";
import { EASE, type OrbPose } from "./layout";

const PEACH = "#ffc9a3";

// Bild 5: the climax. No box, no card: the sphere pulses with peach rings, one big sentence,
// the time runs.

export function CallMoment({ pose }: { pose: OrbPose }) {
  const now = useNow(250);
  const status = useHud((s) => liveCall(s, now));
  const call = useHud((s) => s.call);
  const sentence = useHud(callSentence);
  if (!status || !call) return null;
  const who = maskNumber(call.to) ?? call.to;
  const ms = status === "connected" ? now - (call.connectedAt ?? call.since) : (call.durationMs ?? (call.connectedAt && call.endedAt ? call.endedAt - call.connectedAt : null));
  const live = status === "dialing" || status === "ringing" || status === "connected";

  return (
    <motion.div data-testid="call-moment" data-status={status} className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8, ease: EASE }}>
      {live && (
        <div className="absolute" style={{ left: pose.cx, top: pose.cy }}>
          {[1, 2, 3].map((j) => (
            <span
              key={j}
              className={`call-ring absolute rounded-full ${status === "ringing" ? "call-ring-fast" : ""}`}
              style={{
                width: pose.r * 2 * (1 + j * 0.35),
                height: pose.r * 2 * (1 + j * 0.35),
                left: -pose.r * (1 + j * 0.35),
                top: -pose.r * (1 + j * 0.35),
                border: `1.5px solid rgba(255,201,163,${0.45 / j})`,
                animationDelay: `${j * 0.25}s`,
              }}
            />
          ))}
        </div>
      )}
      <div className="absolute inset-x-0 text-center" style={{ top: 616 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={status} className="text-[19px] tracking-[0.3em]" style={{ color: PEACH }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            {CALL_LABEL[status]}
          </motion.div>
        </AnimatePresence>
        <div className="my-[12px] text-[69px] font-extralight leading-tight text-white">Jarvis ruft {who} an</div>
        <div className="mx-auto max-w-[1300px] text-[29px] tabular-nums" style={{ color: "#c9cdf0" }} data-testid="call-line">
          {ms !== null && ms !== undefined ? fmtDuration(ms) : ""}
          {sentence ? `${ms !== null && ms !== undefined ? " · " : ""}„${sentence}“` : ""}
        </div>
      </div>
    </motion.div>
  );
}
