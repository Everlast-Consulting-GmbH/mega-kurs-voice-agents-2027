"use client";
import { useEffect, useRef, useState } from "react";
import { onFrame } from "@/lib/hooks";
import { playhead, typedChars, type Played } from "@/lib/agents";

/**
 * The time an app window renders at. It only changes when something visible changes (next
 * action, cursor arrived, another typed character, action over), so four typing agents cost a
 * few small renders per frame instead of four full windows at 60 fps.
 */
export function usePlaybackNow(played: Played[]): number {
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef(played);
  ref.current = played;
  useEffect(() => {
    let key = "";
    return onFrame(() => {
      const t = Date.now();
      const { index, current } = playhead(ref.current, t);
      let sub = "";
      if (current) sub = t < current.hit ? "a" : t < current.end ? (current.action === "type" ? `t${typedChars(current, t)}` : "b") : "c";
      const k = `${ref.current.length}:${index}:${sub}`;
      if (k !== key) {
        key = k;
        setNow(t);
      }
    });
  }, []);
  return now;
}
