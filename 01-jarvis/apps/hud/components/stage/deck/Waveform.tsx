"use client";
import { useRef } from "react";
import { voice } from "@/lib/voice";
import { useHud } from "@/lib/events/store";
import { usePaintedCanvas } from "./canvas";

// The real voice levels as a rolling waveform: Jarvis' output bright, the microphone in a
// quieter blue. Read from the voice session every frame it draws (same source as the mouth).

const BARS = 92;

export function Waveform({ width, height }: { width: number; height: number }) {
  const buf = useRef({ level: new Float32Array(BARS), mine: new Uint8Array(BARS), head: 0 });
  const ref = usePaintedCanvas((ctx, w, h, _t, reduced) => {
    const b = buf.current;
    const v = voice();
    const state = useHud.getState().voice.state;
    const out = v.outputLevel();
    const inp = v.inputLevel();
    const speaking = state === "speaking" || state === "acting" || out > inp;
    b.level[b.head] = Math.min(1, Math.max(0, speaking ? out : inp));
    b.mine[b.head] = speaking ? 1 : 0;
    b.head = (b.head + 1) % BARS;

    const mid = h / 2;
    ctx.fillStyle = "rgba(169,200,216,0.14)";
    ctx.fillRect(0, mid - 0.5, w, 1);
    const step = w / BARS;
    const bw = Math.max(1, step * 0.55);
    for (let i = 0; i < BARS; i++) {
      const k = (b.head + i) % BARS; // oldest left, newest right
      const l = b.level[k]!;
      const amp = Math.max(1, Math.pow(l, 0.8) * (h * 0.46));
      const age = i / BARS;
      ctx.fillStyle = b.mine[k] ? `rgba(220,236,245,${(0.25 + age * 0.75).toFixed(3)})` : `rgba(127,180,207,${(0.2 + age * 0.6).toFixed(3)})`;
      ctx.fillRect(i * step, mid - amp, bw, amp * 2);
    }
    if (!reduced) {
      // a soft light on the newest sample
      const g = ctx.createLinearGradient(w - 40, 0, w, 0);
      g.addColorStop(0, "rgba(220,236,245,0)");
      g.addColorStop(1, "rgba(220,236,245,0.08)");
      ctx.fillStyle = g;
      ctx.fillRect(w - 40, 0, 40, h);
    }
  });
  return <canvas ref={ref} aria-hidden="true" data-testid="deck-waveform" style={{ width, height, display: "block" }} />;
}
