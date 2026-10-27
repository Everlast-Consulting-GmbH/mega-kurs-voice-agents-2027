"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useHud } from "@/lib/events/store";
import { summaryLines } from "@/lib/agents";
import { EASE } from "./layout";

/** Bild B: the windows are back in the sphere, the result stays. */
export function RunSummary({ explain }: { explain?: boolean }) {
  const summary = useHud((s) => s.run?.summary ?? null);
  if (!summary) return null;
  const { big, small, parts } = summaryLines(summary);
  return (
    <motion.div data-testid="run-summary" className="pointer-events-none absolute left-0 right-0 text-center" style={{ top: explain ? 560 : 735, transition: "top 0.5s" }} initial="hidden" animate="shown" exit="gone">
      <motion.div
        className="text-[98px] font-extralight leading-none tracking-[-0.02em] text-white"
        style={{ textShadow: "0 8px 60px rgba(255,201,163,0.35)" }}
        variants={{ hidden: { opacity: 0, y: 26, filter: "blur(10px)" }, shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { delay: 0.45, duration: 0.9, ease: EASE } }, gone: { opacity: 0, transition: { duration: 0.5 } } }}
      >
        <span className="sr-only">{big}</span>
        <span aria-hidden>
          {parts.tasks} {parts.taskWord} · <CountUp to={parts.sec} delay={600} /> {parts.secWord}
        </span>
      </motion.div>
      <motion.div
        className="mt-[26px] text-[28px]"
        style={{ color: "#d6d9ff" }}
        variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: { delay: 1.2, duration: 0.8, ease: EASE } }, gone: { opacity: 0, transition: { duration: 0.4 } } }}
      >
        <span className="sr-only">{small}</span>
        <span aria-hidden>
          Ein Mensch hätte dafür etwa <CountUp to={parts.min} delay={1300} /> {parts.minWord} gebraucht.
        </span>
      </motion.div>
    </motion.div>
  );
}

/** The number runs up once (ease-out), so the punchline lands with a little motion. */
function CountUp({ to, delay, ms = 900 }: { to: number; delay: number; ms?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / ms));
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, ms]);
  return <span className="tabular-nums">{n}</span>;
}
