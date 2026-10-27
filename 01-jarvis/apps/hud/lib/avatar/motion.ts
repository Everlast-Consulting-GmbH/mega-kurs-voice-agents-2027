import { KIND, MOUTH_Y, STRIDE } from "./geometry";

// Per-particle animation and light. The WebGL path runs the same math in shader.ts; this TS copy
// drives the Canvas2D fallback and the tests. Keep both in step.

export type AvatarFrame = {
  cx: number;
  cy: number;
  s: number;
  headYaw: number;
  headPitch: number;
  bodyYaw: number;
  /** -1..1 breathing phase */
  breath: number;
  /** 0..1 lip aperture, only from real output audio */
  open: number;
  level: number;
  listen: number;
  think: number;
  fadeFrom: number;
  fadeTo: number;
  /** body y of the slow scan band */
  scan: number;
  zoom: number;
  dim: number;
  warm: number;
  blush: number;
  /** 0..1 heartbeat pulse during a call */
  beat: number;
  time: number;
  /** seconds since the intro started (large = assembled) */
  intro: number;
  /** 0..1 warm light inside head and throat, follows Jarvis' own voice */
  ember: number;
};

/** soft: 0 for crisp head lights, 1 for the blurred body haze. */
export type ParticleOut = { x: number; y: number; size: number; alpha: number; r: number; g: number; b: number; soft?: number };

export const UPPER_LIP_LIFT = 0.035;
export const JAW_DROP = 0.15;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ss = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const step = (e: number, x: number) => (x < e ? 0 : 1);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// light from the upper left front, a soft blue rim from behind
const L = (() => {
  const l = Math.hypot(-0.6, 0.45, 0.66);
  return [-0.6 / l, 0.45 / l, 0.66 / l] as const;
})();
export const COLORS = {
  shadow: [0.24, 0.39, 0.53],
  cyan: [0.55, 0.76, 0.88],
  white: [0.86, 0.94, 0.99],
  warm: [0.73, 0.85, 0.91],
  rim: [0.08, 0.12, 0.16],
  lip: [0.66, 0.83, 0.9],
  /** speech: a gentle amber inside the blue shell */
  ember: [1.0, 0.7, 0.36],
  emberHot: [1.0, 0.86, 0.62],
} as const;
/** overall exposure */
export const GAIN = 1.45;
/** Second, wide low-exposure pass that melts the head's dots into one soft light. */
export const HALO = { size: 3.4, alpha: 0.1 } as const;
/** Body and hands: bigger, fainter, feathered points (a blurred volume, not a mannequin). */
/** The speech light is drawn with wide, feathered points: a glow where a mouth would be, not lips. */
export const SPEECH_GLOW = 2.0;
/** ...and dimmed, since wide points add up to far more light. */
export const SPEECH_DIM = { lip: 0.3, core: 0.8 } as const;
// The body halo used to be 4x wide and filled ~5 screens per frame; 2.6x with more alpha keeps
// the light about equal at well under half the fill.
export const BODY_HAZE = { size: 2.5, alpha: 0.42, haloSize: 2.6, haloAlpha: 0.17 } as const;
/**
 * Closeup camera looks slightly down on the bust (radians, around the head centre), so the
 * contour lines curve like rings seen from above. Full body stands level.
 */
export const VIEW_TILT = 0.13;
/** Bust contour lights in full body: dimmer, so the chest does not outshine the haze limbs. */
export const LINE_FULL = 0.22;
/** Light running slowly along the contour lines. */
export const FLOW = { amount: 0.14, speed: 0.9 } as const;

/** Where the warm speech light sits: inside the lower head and down the throat (rest pose). */
export function emberZone(x: number, y: number) {
  return Math.exp(-(x * x / 0.42 + ((y + 0.45) * (y + 0.45)) / 0.75)) + 0.8 * Math.exp(-(x * x / 0.09 + ((y + 1.35) * (y + 1.35)) / 0.3));
}

/** Ember target: a warm glow while Jarvis speaks, rising with his voice, almost off otherwise. */
export function emberTarget(state: string, outputLevel: number) {
  const l = clamp(Number.isFinite(outputLevel) ? outputLevel : 0, 0, 1);
  if (state === "speaking" || state === "acting") return 0.45 + 0.55 * Math.min(1, l * 2.2);
  return state === "thinking" ? 0.15 : 0.04;
}

/** Lip aperture target from the voice: zero unless Jarvis is audibly speaking. */
export function mouthTarget(state: string, outputLevel: number) {
  if (state !== "speaking" && state !== "acting") return 0;
  const l = clamp(Number.isFinite(outputLevel) ? outputLevel : 0, 0, 1);
  if (l < 0.02) return 0;
  return Math.min(1, Math.pow((l - 0.02) * 2.6, 0.75));
}

/** Fast attack (syllables), slower release, never overshoots. */
export function followMouth(current: number, target: number, dt: number) {
  const rate = target > current ? 38 : 14;
  return current + (target - current) * Math.min(1, dt * rate);
}

export function shadeParticle(d: Float32Array, i: number, f: AvatarFrame, out: ParticleOut) {
  const o = i * STRIDE;
  const px = d[o]!, py = d[o + 1]!, pz = d[o + 2]!;
  let nx = d[o + 3]!, ny = d[o + 4]!, nz = d[o + 5]!;
  const size = d[o + 6]!, bright = d[o + 7]!, kind = d[o + 8]!, seed = d[o + 9]!, jaw = d[o + 10]!, headW = d[o + 11]!;

  const isFeat = step(KIND.feature - 0.5, kind) * step(kind, KIND.mouthCore + 0.5);
  const isLip = step(KIND.lipUpper - 0.5, kind) * step(kind, KIND.lipLower + 0.5);
  const isUpper = step(KIND.lipUpper - 0.5, kind) * step(kind, KIND.lipUpper + 0.5);
  const isCore = step(KIND.mouthCore - 0.5, kind) * step(kind, KIND.mouthCore + 0.5);
  const isFloor = step(KIND.floor - 0.5, kind) * step(kind, KIND.floor + 0.5);
  const isLine = step(KIND.line - 0.5, kind);
  const isBody = step(KIND.body - 0.5, kind) * step(kind, KIND.hand + 0.5) + isLine;

  let x = px, y = py, z = pz;
  // mouth: jaw and lower lip drop, upper lip lifts, the core opens with the aperture
  y += f.open * jaw * mix(-JAW_DROP, UPPER_LIP_LIFT, isUpper);
  y = mix(y, MOUTH_Y + (py - MOUTH_Y) * f.open * 1.2 - f.open * 0.057, isCore);

  // breathing: chest widens, shoulders rise a touch
  const torso = ss(1.6, 2.4, -py) * (1 - ss(6.0, 8.5, -py));
  x *= 1 + f.breath * 0.012 * torso;
  z *= 1 + f.breath * 0.025 * torso;
  y += f.breath * 0.03 * torso;

  // head turns on the neck
  const a = f.headYaw * headW, p = f.headPitch * headW;
  {
    const ry = y + 1.0, rz = z + 0.1;
    const cp = Math.cos(p), sp = Math.sin(p), ca = Math.cos(a), sa = Math.sin(a);
    const y1 = ry * cp - rz * sp, z1 = ry * sp + rz * cp;
    const x2 = x * ca + z1 * sa, z2 = -x * sa + z1 * ca;
    x = x2; y = y1 - 1.0; z = z2 - 0.1;
    const ny1 = ny * cp - nz * sp, nz1 = ny * sp + nz * cp;
    const nx2 = nx * ca + nz1 * sa, nz2 = -nx * sa + nz1 * ca;
    nx = nx2; ny = ny1; nz = nz2;
  }
  // whole body sway (the floor stays put)
  {
    const b = f.bodyYaw * (1 - isFloor);
    const cb = Math.cos(b), sb = Math.sin(b);
    const x2 = x * cb + z * sb, z2 = -x * sb + z * cb;
    x = x2; z = z2;
    const nx2 = nx * cb + nz * sb, nz2 = -nx * sb + nz * cb;
    nx = nx2; nz = nz2;
  }

  // closeup elevation (the floor keeps its own fake tilt)
  {
    const tl = VIEW_TILT * (1 - f.zoom) * (1 - isFloor);
    const ct = Math.cos(tl), st = Math.sin(tl);
    const y2 = y * ct - z * st, z2 = y * st + z * ct;
    y = y2; z = z2;
    const ny2 = ny * ct - nz * st, nz2 = ny * st + nz * ct;
    ny = ny2; nz = nz2;
  }

  // intro: particles fly in from a scattered cloud, head first
  const delay = 0.1 + seed * 0.8 + clamp(-py / 15, 0, 1) * 0.7;
  const e = clamp((f.intro - delay) / 1.3, 0, 1);
  const ease = 1 - Math.pow(1 - e, 3);
  const k = (1 - ease) * (2.5 + seed * 5);
  x += Math.sin(seed * 91.7) * k;
  y += Math.cos(seed * 53.3) * k;
  z += Math.sin(seed * 27.1 + 1.3) * k;

  const persp = 1 / (1 - z * 0.03);
  out.x = f.cx + x * f.s * persp;
  out.y = f.cy - y * f.s * persp;

  // light
  const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  const rim = Math.pow(clamp(1 - Math.abs(nz), 0, 1), 3);
  const shell = ((0.12 + 0.88 * ss(-0.2, 0.9, nz)) * (0.3 + 1.05 * diff) + rim * 1.1) * GAIN;
  let alpha = bright * mix(shell, GAIN, isFeat);
  alpha = mix(alpha, bright * f.zoom * GAIN, isFloor);
  alpha *= mix(1, f.open, isCore);
  alpha *= 1 - isLip * 0.9 * (1 - f.open); // closed lips vanish: no mouth line on a silent face
  const mg = Math.exp(-(px * px + (py + 0.53) * (py + 0.53)) / 0.035) * f.open * (1 - isFloor);
  alpha += isLip * f.open * 0.14 + mg * 0.12; // a soft glow, never a drawn mouth
  const band = Math.exp(-(((py - f.scan) / 0.22) ** 2)) * (1 - isFeat * 0.5) * (1 - isFloor);
  alpha += band * 0.28;
  alpha += Math.pow(0.5 + 0.5 * Math.sin(py * 7 - f.time * 9), 8) * f.think * 0.45 * (1 - isFloor);
  const fade = (1 - ss(f.fadeFrom, f.fadeTo, -py)) * mix(1, 0.38 + f.zoom * 0.62, step(1.5, kind) * (1 - isFloor) * (1 - isFeat));
  const dens = clamp(Math.pow(f.s / 130, 0.5), 0.7, 1) * (1 + f.zoom * mix(0.25, 0.35, isBody) * (1 - isFeat)) * mix(1, LINE_FULL, isLine * f.zoom);
  alpha *= fade * f.dim * ease * dens * (1 + f.level * 0.12) * (1 + f.beat * 0.35) * (1 + f.listen * 0.15 * isFeat);
  alpha *= 1 - isBody * (1 - BODY_HAZE.alpha);
  const flow = 1 + FLOW.amount * Math.sin(Math.atan2(px, pz + 1e-4) * 3 + py * 4 - f.time * FLOW.speed) * (1 - isFloor) * (1 - isFeat);
  // amber inside the head and throat; the silhouette edge stays blue
  const ember = f.ember * emberZone(px, py) * ss(-0.1, 0.8, nz) * (1 - rim) * (1 - isFloor);
  alpha *= flow * (1 + ember * 0.3);
  out.alpha = clamp(alpha, 0, 1.5);
  out.soft = isBody;

  // One ice-blue family across shadows, highlights and moods.
  const c = ss(0.05, 0.85, diff);
  let r = mix(COLORS.shadow[0], COLORS.cyan[0], c);
  let g = mix(COLORS.shadow[1], COLORS.cyan[1], c);
  let bl = mix(COLORS.shadow[2], COLORS.cyan[2], c);
  const w = clamp(Math.pow(diff, 5) * 0.7 + isFeat * (0.45 - isLip * 0.3) + band * 0.5 + isLip * f.open * 0.22 + mg * 0.25 + isCore * 0.2, 0, 1);
  r = mix(r, COLORS.white[0], w);
  g = mix(g, COLORS.white[1], w);
  bl = mix(bl, COLORS.white[2], w);
  const lip = isLip * (1 - f.open) * 0.45;
  r = mix(r, COLORS.lip[0], lip);
  g = mix(g, COLORS.lip[1], lip);
  bl = mix(bl, COLORS.lip[2], lip);
  const rr = rim * (1 - isFeat) * 0.8;
  r += COLORS.rim[0] * rr;
  g += COLORS.rim[1] * rr;
  bl += COLORS.rim[2] * rr;
  const wm = clamp(f.warm * 0.55 + f.blush * 0.7, 0, 0.85);
  r = mix(r, COLORS.warm[0], wm);
  g = mix(g, COLORS.warm[1], wm);
  bl = mix(bl, COLORS.warm[2], wm);
  const em = clamp(ember * 0.85, 0, 0.75);
  r = mix(r, COLORS.ember[0], em);
  g = mix(g, COLORS.ember[1], em);
  bl = mix(bl, COLORS.ember[2], em);
  const hot = (isLip + isCore) * f.ember * 0.85;
  out.r = mix(r, COLORS.emberHot[0], hot);
  out.g = mix(g, COLORS.emberHot[1], hot);
  out.b = mix(bl, COLORS.emberHot[2], hot);
  const dim = 1 - isLip * (1 - SPEECH_DIM.lip) - isCore * (1 - SPEECH_DIM.core);
  out.r *= dim;
  out.g *= dim;
  out.b *= dim;

  out.size = size * clamp(f.s / 130, 0.85, 1.35) * (1 + band * 0.35 + mg * 0.3 + isCore * f.open * 0.4) * mix(1, BODY_HAZE.size, isBody) * (1 + (isLip + isCore) * (SPEECH_GLOW - 1));
  return out;
}
