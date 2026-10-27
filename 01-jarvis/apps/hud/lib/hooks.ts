"use client";
import { useEffect, useState } from "react";

/** Current time, refreshed every `ms` (rAF when ms <= 16). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (ms <= 16) return onFrame(() => setNow(Date.now()));
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Shared animation-frame loop so many small animators cost one rAF. */
type FrameFn = (t: number) => void;
const frameFns = new Set<FrameFn>();
let rafId = 0;
function loop(t: number) {
  frameFns.forEach((f) => {
    try {
      f(t);
    } catch (e) {
      console.warn("[hud] frame callback failed", e);
    }
  });
  rafId = frameFns.size ? requestAnimationFrame(loop) : 0;
}
export function onFrame(fn: FrameFn) {
  frameFns.add(fn);
  if (!rafId) rafId = requestAnimationFrame(loop);
  return () => void frameFns.delete(fn);
}


export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
