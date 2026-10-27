"use client";
import { motion, AnimatePresence } from "motion/react";
import { useHud } from "@/lib/events/store";
import { greeting, priorUserLine, subtitleLine } from "@/lib/stage";
import { useNow } from "@/lib/hooks";
import { useUi } from "@/lib/ui";
import { useVoiceSession, VOICE_PROVIDER } from "@/lib/voice";
import { GLIDE } from "./layout";

const GREETING_AT = 1400; // once the dots have gathered
const SHADOW = { textShadow: "0 0.2cqw 1.5cqw rgba(0,0,0,0.5), 0 2px 28px rgba(0,0,0,0.5)" };

type Box = { left: number; width: number; top: number; size: number };

/**
 * Jarvis' one big line under the sphere; Leo's question pale above it. While `narrating`
 * (agent window on stage, Bild 4) the line stays up until Jarvis says something new.
 */
export function Speaker({ box, hidden, narrating, calm, column, request }: { box: Box; hidden: boolean; narrating?: boolean; calm?: boolean; column?: boolean; request?: string | null }) {
  const captions = useUi((s) => s.explain);
  const now = useNow(100);
  const last = useHud((s) => s.turns.at(-1));
  // request: the command a whole run answers (Bild A), instead of the last thing Leo said ("Ja")
  const lastPrior = useHud((s) => priorUserLine(s.turns, now));
  const prior = request ?? lastPrior;
  const neverSpoken = useHud((s) => s.turns.length === 0);
  const introAt = useUi((s) => s.introAt);
  const v = useVoiceSession();
  const line = hidden ? null : subtitleLine(last, now, narrating ? Infinity : undefined);
  const greet = !hidden && calm && neverSpoken && introAt > 0 && performance.now() - introAt > GREETING_AT;
  const hint = VOICE_PROVIDER !== "mock" && v.state !== "connected" ? "Tippe auf „Anrufen“, um mit Jarvis zu sprechen." : "Sag einfach „Jarvis“.";
  // column: Bild A, the line sits left-aligned in the narrow column under the small sphere
  const small = box.size < 40 && !column;

  if (!captions) return null;

  return (
    <motion.div
      data-testid="speaker"
      className={`pointer-events-none absolute flex ${column ? "justify-start text-left" : "justify-center text-center"}`}
      initial={false}
      animate={{ left: box.left, width: box.width, top: box.top }}
      transition={GLIDE}
    >
      <AnimatePresence mode="wait">
        {line ? (
          <motion.div
            key={line.turnId}
            data-testid="speaker-line"
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.4 } }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            className={`flex flex-col ${column ? "items-start" : "items-center"}`}
            style={SHADOW}
          >
            {line.role === "assistant" && prior && !small && (
              <p data-testid="speaker-prior" className={`line-clamp-2 italic leading-snug ${column ? "mb-[10px] text-[19px]" : "mb-[15px] text-[24px]"}`} style={{ color: "#aab0d8" }}>
                „{prior}“
              </p>
            )}
            <p className="font-normal" style={{ fontSize: box.size, lineHeight: 1.3 }}>
              {line.role === "user" ? (
                <span className="italic" style={{ color: "#c9cdf0" }}>
                  „{line.spoken}“
                </span>
              ) : (
                <>
                  <span className="text-white">{line.spoken}</span>
                  <span className="text-white/40">{line.rest}</span>
                </>
              )}
            </p>
          </motion.div>
        ) : greet ? (
          <motion.div key="greeting" data-testid="speaker-greeting" initial={{ opacity: 0, y: 8, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(6px)" }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} style={SHADOW}>
            <p className="font-normal text-white" style={{ fontSize: box.size, lineHeight: 1.3 }}>
              {greeting()}
            </p>
            <p className="mt-[19px] text-[24px]" style={{ color: "#aab0d8" }}>
              {hint}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
