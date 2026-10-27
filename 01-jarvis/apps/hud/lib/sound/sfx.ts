"use client";
import { useUi } from "@/lib/ui";

// Subtle UI sounds, synthesised with Web Audio (no assets): soft bells, no beeps. Browsers only allow
// audio after a user gesture; the context is unlocked on the first click/key.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined" || useUi.getState().muted) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") return null;
  return { ctx, out: master! };
}

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  void ctx.resume();
}

function tone(freq: number, dur: number, { type = "sine", gain = 0.5, delay = 0, slideTo }: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + delay;
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, { gain = 0.2, delay = 0, from = 400, to = 4000 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + delay;
  const buf = a.ctx.createBuffer(1, Math.ceil(a.ctx.sampleRate * dur), a.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const f = a.ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.out);
  src.start(t);
}

/**
 * A soft glass bell: a sine fundamental plus a few slightly inharmonic partials that die
 * away faster than the fundamental. Quiet by design; it should be felt more than heard.
 */
function bell(freq: number, { gain = 0.12, delay = 0, decay = 1.6 }: { gain?: number; delay?: number; decay?: number } = {}) {
  const partials: Array<[number, number, number]> = [
    [1, 1, 1],
    [2.01, 0.32, 0.55],
    [3.03, 0.12, 0.35],
    [4.17, 0.05, 0.22],
  ];
  for (const [ratio, amp, life] of partials) tone(freq * ratio, decay * life, { type: "sine", gain: gain * amp, delay });
}

/** A breath of filtered noise, used for big transitions instead of a whoosh. */
function air(dur: number, opts: { gain?: number; delay?: number; from?: number; to?: number } = {}) {
  noise(dur, { gain: 0.08, ...opts });
}

let ringTimer: ReturnType<typeof setInterval> | null = null;

// The scene speaks one sound language: soft glass bells in a pentatonic set (no beeps,
// no square waves). Pitches stay within C6-E7 so they never mask the voice.
const N = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760 } as const;

export const sfx = {
  boot() {
    air(2.4, { gain: 0.07, from: 180, to: 2400 });
    [N.C5, N.G5, N.C6, N.E6].forEach((f, i) => bell(f, { gain: 0.07, delay: 1.9 + i * 0.16, decay: 2.6 }));
  },
  toolStart() {
    bell(N.A6, { gain: 0.025, decay: 0.5 });
  },
  toolDone(ok: boolean) {
    bell(ok ? N.E6 : N.A5, { gain: 0.04, decay: ok ? 0.8 : 1.2 });
  },
  taskDone() {
    [N.C6, N.E6, N.G6].forEach((f, i) => bell(f, { gain: 0.08, delay: i * 0.11, decay: 1.8 }));
  },
  taskFailed() {
    bell(N.E5, { gain: 0.07, decay: 1.6 });
    bell(N.C5, { gain: 0.06, delay: 0.22, decay: 2 });
  },
  approval() {
    bell(N.G5, { gain: 0.09, decay: 1.6 });
    bell(N.D6, { gain: 0.08, delay: 0.2, decay: 1.8 });
  },
  alert(urgent: boolean) {
    // urgent: the same two bells, twice, a little brighter; info: a single soft bell
    if (!urgent) return bell(N.E6, { gain: 0.06, decay: 1.4 });
    for (let i = 0; i < 2; i++) {
      bell(N.A5, { gain: 0.09, delay: i * 0.6, decay: 1.4 });
      bell(N.E6, { gain: 0.09, delay: i * 0.6 + 0.16, decay: 1.6 });
    }
  },
  approved(ok: boolean) {
    if (ok) [N.G5, N.C6, N.E6].forEach((f, i) => bell(f, { gain: 0.08, delay: i * 0.08, decay: 1.6 }));
    else bell(N.E5, { gain: 0.07, decay: 1.4 });
  },
  takeover() {
    air(1.2, { gain: 0.08, from: 2400, to: 160 });
    bell(N.C5, { gain: 0.09, delay: 0.2, decay: 2.4 });
  },
  click() {
    bell(N.A6 * 1.5, { gain: 0.015, decay: 0.18 });
  },
  briefing() {
    bell(N.G6, { gain: 0.04, decay: 1 });
  },
  learned() {
    [N.C6, N.D6, N.E6, N.G6, N.A6].forEach((f, i) => bell(f, { gain: 0.05, delay: i * 0.09, decay: 1.6 }));
  },
  ring(on: boolean) {
    if (ringTimer) clearInterval(ringTimer);
    ringTimer = null;
    if (!on) return;
    // a gentle two-bell phrase every 1.8 s, in time with the sphere's ring pulse
    const phrase = () => {
      bell(N.E6, { gain: 0.07, decay: 1.2 });
      bell(N.C6, { gain: 0.06, delay: 0.16, decay: 1.4 });
    };
    phrase();
    ringTimer = setInterval(phrase, 1800);
  },
};
