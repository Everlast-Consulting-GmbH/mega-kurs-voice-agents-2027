"use client";
import { useEffect, useRef } from "react";
import { onFrame } from "@/lib/hooks";

// Small shared helper for the deck's two canvases (globe, waveform): sizes the backing store to
// the on-screen size (the stage is CSS-scaled), throttles drawing and honours reduced motion.

export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, reduced: boolean) => void;

export function usePaintedCanvas(paint: Painter, fps = 30) {
  const ref = useRef<HTMLCanvasElement>(null);
  const painter = useRef(paint);
  painter.current = paint;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let scale = 1;
    const fit = () => {
      const b = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      scale = (b.width / canvas.offsetWidth || 1) * dpr;
      canvas.width = Math.max(1, Math.round(canvas.offsetWidth * scale));
      canvas.height = Math.max(1, Math.round(canvas.offsetHeight * scale));
    };
    fit();
    const onResize = () => requestAnimationFrame(fit);
    window.addEventListener("resize", onResize);
    let last = -Infinity;
    const stop = onFrame((now) => {
      if (document.hidden) return;
      const reduced = !!media?.matches;
      // reduced motion: a few still frames per second keep data current without movement
      if (now - last < 1000 / (reduced ? 4 : fps)) return;
      last = now;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      painter.current(ctx, canvas.offsetWidth, canvas.offsetHeight, now / 1000, reduced);
    });
    return () => {
      stop();
      window.removeEventListener("resize", onResize);
    };
  }, [fps]);
  return ref;
}
