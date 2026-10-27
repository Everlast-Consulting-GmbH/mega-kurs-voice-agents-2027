"use client";
import { useEffect, useRef } from "react";
import { useHud } from "@/lib/events/store";
import { onFrame } from "@/lib/hooks";
import { useUi } from "@/lib/ui";
import { voice } from "@/lib/voice";
import type { PayloadOf } from "@jarvis/contracts";
import { buildAvatar, CROWN, STRIDE, type AvatarCloud } from "@/lib/avatar/geometry";
import { avatarCamera } from "@/lib/avatar/camera";
import { COLORS, emberTarget, followMouth, mouthTarget, shadeParticle, type AvatarFrame, type ParticleOut } from "@/lib/avatar/motion";
import { AVATAR_FRAGMENT, AVATAR_VERTEX } from "@/lib/avatar/shader";
import { H, W, type OrbPose } from "./layout";

// Jarvis himself: a human made of ~13k particles of light, the only element that is always alive.
// The head sits where the old sphere sat (pose cx/cy, size from r). In closeup he is a holographic
// bust of fine blue contour lines; when he speaks, a gentle amber light rises inside head and
// throat. He breathes, looks around, listens, thinks in scan bands, and his mouth light opens with
// the real output level of his voice.
// fullBody zooms the same figure out until he stands head to toe, supervising the systems.

type VoiceState = PayloadOf<"voice.state">["state"];
type Mod = { scan: number; listen: number; think: number };
const VOICE: Record<VoiceState, Mod> = {
  idle: { scan: 0.16, listen: 0, think: 0 },
  listening: { scan: 0.12, listen: 1, think: 0 },
  thinking: { scan: 0.4, listen: 0, think: 1 },
  speaking: { scan: 0.16, listen: 0, think: 0 },
  acting: { scan: 0.3, listen: 0, think: 0.4 },
};

export type OrbMood = { blush: boolean; beat: boolean; warm?: boolean };

let CLOUD: AvatarCloud | null = null;
const cloud = () => (CLOUD ??= buildAvatar());

function compile(gl: WebGLRenderingContext) {
  const p = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, AVATAR_VERTEX],
    [gl.FRAGMENT_SHADER, AVATAR_FRAGMENT],
  ] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(sh); gl.deleteShader(sh); gl.deleteProgram(p); throw new Error(error ?? "shader"); }
    gl.attachShader(p, sh);
    gl.deleteShader(sh);
  }
  ["aPos", "aNrm", "aA", "aB"].forEach((name, i) => gl.bindAttribLocation(p, i, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const error = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error(error ?? "link"); }
  return p;
}

/** Critically damped-ish spring step for one value. */
function spring(v: { x: number; v: number }, target: number, dt: number, k = 110) {
  const c = 2 * Math.sqrt(k) * 0.95;
  v.v += ((target - v.x) * k - v.v * c) * dt;
  v.x += v.v * dt;
}

type Renderer = { pixelRatioCap: number; kind: "webgl" | "canvas2d"; draw: (f: AvatarFrame) => void; dispose: () => void };

function webglRenderer(canvas: HTMLCanvasElement, c: AvatarCloud): Renderer | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  if (!gl) return null;
  let prog: WebGLProgram;
  try {
    prog = compile(gl);
  } catch (e) {
    console.warn("[hud] avatar shader unavailable", e);
    return null;
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, c.data, gl.STATIC_DRAW);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const U = { cam: u("uCam"), motion: u("uMotion"), voice: u("uVoice"), look: u("uLook"), mood: u("uMood"), time: u("uTime"), view: u("uView"), halo: u("uHalo"), ember: u("uEmber") };
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "";
  const pixelRatioCap = /swiftshader|llvmpipe|lavapipe|software/i.test(renderer) ? 1 : 2;
  const B = STRIDE * 4;
  return {
    kind: "webgl",
    pixelRatioCap,
    draw(f) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE); // light adds up: dense regions glow
      gl.useProgram(prog);
      gl.uniform4f(U.cam, f.cx, f.cy, f.s, canvas.width / W || 1);
      gl.uniform4f(U.motion, f.headYaw, f.headPitch, f.bodyYaw, f.breath);
      gl.uniform4f(U.voice, f.open, f.level, f.listen, f.think);
      gl.uniform4f(U.look, f.fadeFrom, f.fadeTo, f.scan, f.zoom);
      gl.uniform4f(U.mood, f.dim, f.warm, f.blush, f.beat);
      gl.uniform2f(U.time, f.time, f.intro);
      gl.uniform1f(U.ember, f.ember);
      gl.uniform2f(U.view, W, H);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const attr = (i: number, size: number, offset: number) => {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, size, gl.FLOAT, false, B, offset * 4);
      };
      attr(0, 3, 0);
      attr(1, 3, 3);
      attr(2, 4, 6);
      attr(3, 2, 10);
      // A broad low-exposure pass joins individual points into a soft luminous volume.
      gl.uniform1f(U.halo, 1);
      gl.drawArrays(gl.POINTS, 0, c.count);
      gl.uniform1f(U.halo, 0);
      gl.drawArrays(gl.POINTS, 0, c.count);
    },
    dispose() {
      // keep the context: StrictMode remounts on the same canvas
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    },
  };
}

/** No GPU: the same figure on the CPU with every second particle, still clearly a person. */
function canvasRenderer(canvas: HTMLCanvasElement, c: AvatarCloud): Renderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const out: ParticleOut = { x: 0, y: 0, size: 0, alpha: 0, r: 0, g: 0, b: 0, soft: 0 };
  const stride = c.count > 7000 ? 2 : 1;
  // Pre-rendered radial lights keep the CPU fallback soft without per-frame gradients.
  const sprite = (color: readonly number[], mid: number) => {
    const el = document.createElement("canvas");
    el.width = el.height = 32;
    const paint = el.getContext("2d")!;
    const rgb = color.map((v) => Math.round(v * 255)).join(",");
    const g = paint.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(mid, `rgba(${rgb},0.5)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    paint.fillStyle = g;
    paint.fillRect(0, 0, 32, 32);
    return el;
  };
  const tones = [COLORS.shadow, COLORS.cyan, COLORS.white, COLORS.ember].map((color) => sprite(color, 0.35));
  // the body haze: one wide, flat light per particle
  const haze = sprite(COLORS.cyan, 0.6);
  return {
    kind: "canvas2d",
    pixelRatioCap: 1,
    draw(f) {
      const k = canvas.width / W || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";
      // thin out by each particle's random seed, not by index: an index stride would draw the
      // face spiral as visible arms
      for (let i = 0; i < c.count; i++) {
        if (stride > 1 && c.data[i * STRIDE + 9]! >= 1 / stride) continue;
        shadeParticle(c.data, i, f, out);
        if (out.alpha < 0.01) continue;
        const lum = (out.r + out.g + out.b) / 3;
        ctx.globalAlpha = Math.min(1, out.alpha * stride * 0.8);
        const s = Math.max(2, out.size * k * (out.soft ? 1.6 : 1.7));
        const tone = out.r > out.b + 0.12 ? 3 : lum > 0.82 ? 2 : lum > 0.55 ? 1 : 0; // 3: amber speech light
        ctx.drawImage(out.soft && tone !== 3 ? haze : tones[tone]!, out.x * k - s / 2, out.y * k - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    },
    dispose() {},
  };
}

const GLOW = 760; // glow element size at head scale 130 px/unit
const CORE = { w: 230, h: 300 }; // inner light, inside the head outline (130 px/unit)
const EMBER = { w: 200, h: 400 }; // warm speech light from the lower head down the throat (130 px/unit)

export function Orb({ pose, mood, fullBody = false }: { pose: OrbPose; mood: OrbMood; fullBody?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const emberRef = useRef<HTMLDivElement>(null);
  const diagRef = useRef<HTMLDivElement>(null);
  const target = useRef({ pose, mood, fullBody });
  target.current = { pose, mood, fullBody };

  useEffect(() => {
    const primary = canvasRef.current;
    const fallback = fallbackRef.current;
    let canvas = primary;
    const glow = glowRef.current;
    const core = coreRef.current;
    const emberEl = emberRef.current;
    const diag = diagRef.current;
    if (!canvas || !fallback || !glow || !core || !emberEl || !diag) return;
    const c = cloud();
    const force2d = typeof location !== "undefined" && new URLSearchParams(location.search).get("avatar") === "2d";
    let r = force2d ? null : webglRenderer(canvas, c);
    if (!r) { canvas = fallback; r = canvasRenderer(canvas, c); }
    if (!r) return;
    primary!.style.display = canvas === primary ? "block" : "none";
    fallback.style.display = canvas === fallback ? "block" : "none";

    const p0 = target.current.pose;
    const cx = { x: p0.cx, v: 0 }, cy = { x: p0.cy, v: 0 }, cr = { x: p0.r, v: 0 };
    const zoom = { x: target.current.fullBody ? 1 : 0, v: 0 };
    const m = { scan: 0.16, listen: 0, think: 0, level: 0, open: 0, ember: 0, blush: 0, beat: 0, warm: 0, dim: 1, time: 0, scanPos: 0 };
    const f: AvatarFrame = {
      cx: 0, cy: 0, s: 1, headYaw: 0, headPitch: 0, bodyYaw: 0, breath: 0, open: 0, level: 0, listen: 0, think: 0,
      fadeFrom: 0, fadeTo: 1, scan: 0, zoom: 0, dim: 1, warm: 0, blush: 0, beat: 0, time: 0, intro: 99, ember: 0,
    };
    // Reduced motion: the figure stays almost still and skips the fly-in; voice light and mouth keep working.
    const motionQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let still = motionQuery?.matches ?? false;
    const onMotionPref = (e: MediaQueryListEvent) => { still = e.matches; };
    motionQuery?.addEventListener?.("change", onMotionPref);
    let last = performance.now();
    let lastDiag = 0;
    diag.dataset.renderer = r.kind;
    diag.dataset.particles = String(c.count);
    diag.dataset.pixelRatioCap = String(r.pixelRatioCap);

    // The canvas size only changes with the stage scale, i.e. on resize: no layout read per frame.
    const fit = () => {
      const b = canvas.getBoundingClientRect();
      const dpr = Math.min(r.pixelRatioCap, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(b.width * dpr));
      canvas.height = Math.max(1, Math.round(b.height * dpr));
    };
    const onResize = () => requestAnimationFrame(fit);
    fit();
    requestAnimationFrame(fit);
    window.addEventListener("resize", onResize);

    const frame = (now: number) => {
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const { pose: tp, mood, fullBody: fb } = target.current;
      spring(cx, tp.cx, dt);
      spring(cy, tp.cy, dt);
      spring(cr, tp.r, dt);
      spring(zoom, fb ? 1 : 0, dt, 26); // the zoom is a slow, cinematic dolly (~1.2 s)
      const z = Math.min(1, Math.max(0, zoom.x));

      const s = useHud.getState();
      const ui = useUi.getState();
      const vs = s.voice.state;
      const p = VOICE[vs];
      const v = voice();
      const out = v.outputLevel();
      const raw = vs === "speaking" ? out : vs === "listening" ? v.inputLevel() : 0;
      const k = Math.min(1, dt * 2.5);
      m.scan += (p.scan - m.scan) * k;
      m.listen += (p.listen - m.listen) * k;
      m.think += (p.think - m.think) * k;
      m.level += (raw - m.level) * Math.min(1, dt * (raw > m.level ? 18 : 6));
      m.open = followMouth(m.open, mouthTarget(vs, out), dt);
      const et = emberTarget(vs, out);
      m.ember += (et - m.ember) * Math.min(1, dt * (et > m.ember ? 5 : 1.4)); // swells with speech, fades slowly
      m.blush += ((mood.blush ? 1 : 0) - m.blush) * Math.min(1, dt * 1.5);
      m.beat += ((mood.beat ? 1 : 0) - m.beat) * Math.min(1, dt * 2);
      m.warm += ((mood.warm ? 1 : 0) - m.warm) * Math.min(1, dt * 1.2);
      m.dim += ((s.connection.state === "reconnecting" ? 0.45 : 1) - m.dim) * Math.min(1, dt * 2);
      m.time += dt;
      const t = m.time;

      const cam = avatarCamera({ cx: cx.x, cy: cy.x, r: cr.x }, z);
      // the scan band sweeps from above the crown down through what is visible, then pauses
      m.scanPos = (m.scanPos + dt * m.scan * (still ? 0.4 : 1)) % 1;
      const reach = Math.min(cam.fadeTo, 14.4);
      const sweep = m.scanPos / 0.75;
      f.scan = sweep < 1 ? CROWN + 0.4 - sweep * (CROWN + 0.4 + reach) : 99;

      // call heartbeat (in time with the ring sound, 1.8 s)
      const bt = (t % 1.8) / 1.8;
      const beat = (Math.exp(-bt * 14) + 0.6 * Math.exp(-Math.abs(bt - 0.16) * 18)) * m.beat;

      f.cx = cam.cx;
      f.cy = cam.cy;
      f.s = cam.s;
      f.fadeFrom = cam.fadeFrom;
      f.fadeTo = cam.fadeTo;
      // idle life: a slow glance, more of a survey when he stands back; listening faces you
      const calm = (1 - m.listen * 0.65) * (still ? 0.25 : 1);
      f.headYaw = (0.11 * Math.sin(t * 0.37) + 0.04 * Math.sin(t * 0.91 + 1) + 0.32 * z * Math.sin(t * 0.21)) * calm;
      f.headPitch = -0.03 + 0.02 * Math.sin(t * 0.5) + m.listen * 0.07 + m.think * 0.04 * Math.sin(t * 1.3);
      f.bodyYaw = (0.06 * Math.sin(t * 0.23) + 0.1 * z * Math.sin(t * 0.17 + 2)) * calm;
      f.breath = (Math.sin((t * Math.PI * 2) / 4.6) + 0.15 * Math.sin(t * Math.PI * 2 * 1.1) * m.blush) * (still ? 0.4 : 1);
      f.open = m.open;
      f.level = m.level;
      f.listen = m.listen;
      f.think = m.think;
      f.zoom = z;
      f.dim = m.dim;
      f.warm = m.warm;
      f.blush = m.blush * (0.7 + 0.3 * Math.sin(t * Math.PI * 2 * 1.1));
      f.beat = beat;
      f.time = t;
      f.intro = ui.introAt && !still ? (now - ui.introAt) / 1000 : 99;
      f.ember = m.ember * m.dim;
      r.draw(f);

      // the soft glow behind the head follows the same camera
      glow.style.transform = `translate(${cam.cx - GLOW / 2}px, ${cam.cy - GLOW / 2}px) scale(${(cam.s / 130) * (1 + m.open * 0.08)})`;
      glow.style.opacity = String((0.85 + m.open * 0.15) * m.dim * Math.min(1, f.intro / 1.6));
      // inner light: the head glows from within and brightens with voice and attention
      const headY = cam.cy - 0.18 * cam.s;
      core.style.transform = `translate(${cam.cx - CORE.w / 2}px, ${headY - CORE.h / 2}px) scale(${(cam.s / 130) * (1 + m.level * 0.05)})`;
      const introLight = Math.min(1, Math.max(0, (f.intro - 0.8) / 1.6));
      // the cool inner light gives way to the amber one while he speaks
      core.style.opacity = String((0.82 + m.level * 0.18 + m.listen * 0.1 + m.think * 0.12) * (1 - z * 0.55) * (1 - m.ember * 0.55) * m.dim * introLight);
      emberEl.style.transform = `translate(${cam.cx - EMBER.w / 2}px, ${cam.cy + 0.75 * cam.s - EMBER.h / 2}px) scale(${(cam.s / 130) * (1 + m.open * 0.04)})`;
      emberEl.style.opacity = String(Math.min(1, m.ember * (0.85 + m.open * 0.15)) * (1 - z * 0.5) * m.dim * introLight);

      if (now - lastDiag >= 100) {
        lastDiag = now;
        const d = diag.dataset;
        d.mode = z > 0.5 ? "fullbody" : "closeup";
        d.zoom = z.toFixed(2);
        d.voiceState = vs;
        d.mouthOpen = m.open.toFixed(2);
        d.outputLevel = out.toFixed(2);
        d.headX = cam.cx.toFixed(0);
        d.headY = cam.cy.toFixed(0);
        d.scale = cam.s.toFixed(1);
        d.assembled = f.intro > 2.8 ? "true" : "false";
      }
    };
    const stop = onFrame(frame);
    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      motionQuery?.removeEventListener?.("change", onMotionPref);
      r.dispose();
    };
  }, []);

  return (
    <>
      <div
        ref={glowRef}
        data-testid="orb-glow"
        className="pointer-events-none absolute left-0 top-0"
        style={{
          width: GLOW,
          height: GLOW,
          transformOrigin: "center",
          background: "radial-gradient(ellipse closest-side, rgba(150,200,224,0.15), rgba(102,153,178,0.045) 56%, rgba(102,153,178,0))",
          transition: "background 1.2s",
          opacity: 0,
          willChange: "transform, opacity",
        }}
      />
      <div
        ref={emberRef}
        aria-hidden="true"
        data-testid="orb-ember"
        className="pointer-events-none absolute left-0 top-0"
        style={{
          width: EMBER.w,
          height: EMBER.h,
          transformOrigin: "center",
          background: "radial-gradient(ellipse closest-side, rgba(255,198,122,0.5), rgba(255,160,76,0.18) 46%, rgba(255,140,60,0))",
          opacity: 0,
          willChange: "transform, opacity",
        }}
      />
      <div
        ref={coreRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0"
        style={{
          width: CORE.w,
          height: CORE.h,
          transformOrigin: "center",
          background: "radial-gradient(ellipse closest-side, rgba(236,247,255,0.42), rgba(176,214,236,0.14) 48%, rgba(150,200,228,0))",
          mixBlendMode: "screen",
          opacity: 0,
          zIndex: 1,
          willChange: "transform, opacity",
        }}
      />
      <canvas ref={canvasRef} data-testid="orb" className="pointer-events-none absolute inset-0" style={{ width: W, height: H, filter: "blur(0.65px)" }} />
      <canvas ref={fallbackRef} data-testid="avatar-fallback" className="pointer-events-none absolute inset-0" style={{ width: W, height: H, display: "none", filter: "blur(0.65px)" }} />
      <div ref={diagRef} data-testid="avatar-frame" data-mode={fullBody ? "fullbody" : "closeup"} hidden />
    </>
  );
}
