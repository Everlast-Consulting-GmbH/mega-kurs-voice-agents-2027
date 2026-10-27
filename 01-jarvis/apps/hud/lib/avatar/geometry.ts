// Jarvis as a human made of light: a procedural point cloud of a standing figure.
//
// Body units: the head centre is the origin, y points up, z points to the viewer, and one unit
// is half a head height (crown +1.05, chin -1.0). The figure is ~7.6 heads tall: soles at -14.15.
// Every particle is sampled on a surface (head, limbs, torso). Head, neck and torso are drawn as
// fine horizontal contour lines (a holographic scan of a bust); limbs stay a soft haze. The face
// has no drawn features, only a faint relief (brow, sockets, a soft bridge) that bends the lines,
// and a narrow light that follows speech. Deterministic for a given seed.

export const STRIDE = 12; // pos(3) normal(3) size bright kind seed jaw headW

/**
 * Particle kinds. FEATURE..MOUTH_CORE belong to the face drawing and ignore surface shading.
 * LINE is a bust contour light: body-like, but kept readable in closeup and calmer in full body.
 */
export const KIND = {
  skin: 0,
  hair: 1,
  body: 2,
  hand: 3,
  floor: 4,
  feature: 5,
  iris: 6,
  eyeWhite: 7,
  lipUpper: 8,
  lipLower: 9,
  mouthCore: 10,
  line: 11,
} as const;
export type KindName = keyof typeof KIND;

export const CROWN = 1.05;
export const SOLE = -14.15;
export const MOUTH_Y = -0.5;
export const EYE = { x: 0.29, y: 0.11 } as const;

// ---------------------------------------------------------------------------------- small math

type V3 = [number, number, number];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Piecewise linear profile through [x, value] knots (x ascending). */
function profile(knots: Array<[number, number]>) {
  return (x: number) => {
    if (x <= knots[0]![0]) return knots[0]![1];
    for (let i = 1; i < knots.length; i++) {
      const [x1, v1] = knots[i]!;
      if (x <= x1) {
        const [x0, v0] = knots[i - 1]!;
        const t = (x - x0) / (x1 - x0);
        return lerp(v0, v1, t * t * (3 - 2 * t));
      }
    }
    return knots[knots.length - 1]![1];
  };
}

// ---------------------------------------------------------------------------------- the head

const HX = 0.79;
const HY = 1.03;
const HZ = 0.88;
const HOY = 0.02;
/**
 * Head width over height: a full cranium (not an egg's point), soft cheekbones, a jaw that narrows
 * into a rounded chin.
 */
const jawTaper = (y: number) =>
  1 +
  0.035 * Math.sin(Math.PI * clamp((y - HOY) / HY, 0, 1)) +
  0.03 * Math.exp(-(((y + 0.1) / 0.22) ** 2)) -
  0.08 * smooth(0.45, 0.9, -y) +
  0.05 * smooth(0.8, 1.0, -y);

const gauss = (v: number) => Math.exp(-v * v);
/**
 * Faint face relief, only enough to bend the contour lines and catch light: a brow, shallow
 * sockets and a soft bridge. Zero around the mouth, so the speech light sits on the surface.
 */
export function faceRelief(x: number, y: number) {
  const ax = Math.abs(x);
  const brow = 0.035 * gauss((y - 0.3) / 0.1) * (1 - smooth(0.3, 0.6, ax));
  const socket = -0.045 * gauss((ax - EYE.x) / 0.14) * gauss((y - EYE.y) / 0.1);
  const bridge = 0.05 * gauss(x / 0.08) * smooth(-0.36, -0.22, y) * (1 - smooth(0.12, 0.3, y));
  return brow + socket + bridge;
}

/** Head surface for a unit direction (front = dz > 0). */
export function headPoint(dx: number, dy: number, dz: number): V3 {
  const y = dy * HY + HOY;
  // a soft swell where the ears sit breaks the egg outline (no ear drawn)
  const ear = 1 + 0.06 * gauss(dz / 0.3) * gauss((y + 0.12) / 0.2);
  const x = dx * HX * jawTaper(y) * ear;
  if (dz >= 0) {
    const fr = smooth(0.15, 0.7, dz);
    const z = dz * HZ * (1 - 0.08 * fr) * (1 - 0.06 * smooth(0.1, 1, -y)) + faceRelief(x, y) * fr;
    return [x, y, z];
  }
  return [x, y, dz * HZ * (1 - 0.45 * smooth(0.1, 1, -y))];
}

/** Front surface depth at (x, y), or null outside the head outline. */
export function headFront(x: number, y: number): number | null {
  const dy = (y - HOY) / HY;
  const dx = x / (HX * jawTaper(y));
  const r2 = 1 - dx * dx - dy * dy;
  if (r2 < 0) return null;
  return headPoint(dx, dy, Math.sqrt(r2))[2];
}

function headNormal(dx: number, dy: number, dz: number): V3 {
  const d: V3 = [dx, dy, dz];
  const a: V3 = Math.abs(dy) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t1 = norm(cross(d, a));
  const t2 = cross(d, t1);
  const e = 2e-3;
  const p = headPoint(dx, dy, dz);
  const p1 = headPoint(...norm([dx + t1[0] * e, dy + t1[1] * e, dz + t1[2] * e]));
  const p2 = headPoint(...norm([dx + t2[0] * e, dy + t2[1] * e, dz + t2[2] * e]));
  let n = norm(cross(sub(p1, p), sub(p2, p)));
  if (n[0] * p[0] + n[1] * (p[1] - HOY) + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]];
  return n;
}

function frontNormal(x: number, y: number): V3 {
  const e = 4e-3;
  const z = headFront(x, y) ?? 0;
  const zx = (headFront(x + e, y) ?? z) - z;
  const zy = (headFront(x, y + e) ?? z) - z;
  return norm([-zx / e, -zy / e, 1]);
}

/** Height (direction y) above which the scalp is covered by hair. */
const hairLine = (d: V3) => (d[2] > 0 ? lerp(0.05, 0.5, smooth(0, 0.6, d[2])) : lerp(0.05, -0.38, smooth(0, 0.7, -d[2])));

const insideHead = (x: number, y: number, z: number) =>
  (x / (HX * jawTaper(y))) ** 2 + ((y - HOY) / HY) ** 2 + (z / (HZ * (z < 0 ? 1 - 0.45 * smooth(0.1, 1, -y) : 1))) ** 2 < 0.94;

// eyes: an almond with the outer corner slightly raised
const LID_W = 0.148;
export const upperLid = (t: number, side: number) => 0.058 * Math.pow(Math.max(0, 1 - t * t), 0.75) + 0.01 * t * side;
export const lowerLid = (t: number, side: number) => -0.042 * Math.pow(Math.max(0, 1 - t * t), 0.9) + 0.01 * t * side;
function inAlmond(x: number, y: number, pad = 0) {
  const side = Math.sign(x) || 1;
  const t = (x - side * EYE.x) / (LID_W + pad);
  if (Math.abs(t) >= 1) return false;
  const ly = y - EYE.y;
  return ly < upperLid(t, side) + pad && ly > lowerLid(t, side) - pad;
}

// lips: cupid's bow on top, a full lower lip, mouth corners slightly up
export const LIP_W = 0.215;
export const mouthLine = (t: number) => MOUTH_Y + 0.008 * t * t;
export const upperLipTop = (t: number) =>
  -0.452 - 0.03 * t * t - 0.012 * Math.exp(-((t / 0.12) ** 2)) + 0.006 * Math.exp(-(((Math.abs(t) - 0.28) / 0.12) ** 2));
export const lowerLipBottom = (t: number) => MOUTH_Y - 0.085 * Math.pow(Math.max(0, 1 - t * t), 0.65);
function inLips(x: number, y: number, pad = 0.02) {
  const t = x / (LIP_W + pad);
  if (Math.abs(t) >= 1) return false;
  return y < upperLipTop(t) + pad && y > lowerLipBottom(t) - pad;
}

/** The head shell follows the jaw only a little: speech opens a light, it does not sculpt a chin. */
const SKIN_JAW = 0.2;

/** How much a face point follows the opening jaw (chin and the area below the mouth). */
export function jawWeight(x: number, y: number) {
  return smooth(0.5, 0.66, -y) * (1 - smooth(0.3, 0.66, Math.abs(x)));
}

// ---------------------------------------------------------------------------------- the body

/** Torso cross-section half-widths along y (shoulder slope, chest, waist, hips). */
const TORSO_TOP = -1.6;
const TORSO_BOTTOM = -8.1;
const torsoRx = profile([
  [-8.1, 1.12],
  [-7.6, 1.46],
  [-7.0, 1.44],
  [-6.1, 1.2],
  [-5.2, 1.3],
  [-4.2, 1.5],
  [-3.2, 1.64],
  [-2.8, 1.74],
  [-2.45, 1.7],
  [-2.1, 1.32],
  [-1.82, 0.85],
  [-1.6, 0.5],
]);
const torsoRz = profile([
  [-8.1, 0.75],
  [-7.6, 0.92],
  [-7.0, 0.9],
  [-6.1, 0.78],
  [-5.2, 0.84],
  [-4.2, 0.95],
  [-3.2, 0.98],
  [-2.55, 0.88],
  [-2.1, 0.7],
  [-1.82, 0.56],
  [-1.6, 0.46],
]);
const insideTorso = (x: number, y: number, z: number, k = 0.96) =>
  y < TORSO_TOP && y > TORSO_BOTTOM && (x / torsoRx(y)) ** 2 + (z / torsoRz(y)) ** 2 < k;
function torsoFront(x: number, y: number) {
  const q = 1 - (x / torsoRx(y)) ** 2;
  return q > 0 ? torsoRz(y) * Math.sqrt(q) : 0;
}

/** Left-right mirrored joint positions (right side, x > 0). */
export const JOINTS = {
  shoulder: [1.72, -2.68, 0] as V3,
  elbow: [2.15, -5.55, -0.1] as V3,
  wrist: [2.28, -7.95, 0.15] as V3,
  hip: [0.82, -7.5, 0.02] as V3,
  knee: [0.78, -11.1, 0.05] as V3,
  ankle: [0.74, -13.75, -0.05] as V3,
};

// ---------------------------------------------------------------------------------- builder

export type AvatarCloud = {
  data: Float32Array;
  count: number;
  counts: Record<KindName, number>;
};

type Push = (p: V3, n: V3, size: number, bright: number, kind: number, jaw?: number, headW?: number) => void;

/** Horizontal contour lines: line spacing in body units and how much of each line lies on the back. */
export const CONTOUR = { head: 0.046, neck: 0.085, torso: 0.15, back: 0.4, torsoBack: 0.3 } as const;

/**
 * Build the figure. `density` scales every count (1 = ~13k particles); the head and face keep
 * their share so the face stays the hero at every density.
 */
export function buildAvatar({ seed = 7, density = 1 }: { seed?: number; density?: number } = {}): AvatarCloud {
  const rnd = mulberry32(seed);
  const out: number[] = [];
  const counts = Object.fromEntries(Object.keys(KIND).map((k) => [k, 0])) as Record<KindName, number>;
  const names = Object.keys(KIND) as KindName[];
  const push: Push = (p, n, size, bright, kind, jaw = 0, headW = 0) => {
    out.push(p[0], p[1], p[2], n[0], n[1], n[2], size, bright, kind, rnd(), jaw, headW);
    counts[names[kind]!]++;
  };
  // Broad, faint lights suggest the limbs' volume without anatomical surface detail; the shader
  // draws them as wide, feathered haze so they read soft and out of focus.
  const haze: Push = (p, n, _size, bright, kind, jaw, headW) => push(p, n, 6.4, bright * 0.3, kind, jaw, headW);
  const N = (n: number) => Math.max(1, Math.round(n * density));
  const j = (a: number) => (rnd() - 0.5) * a; // texture jitter

  // --- head: fine horizontal contour lines, evenly spaced on screen like a scan. Each line is a
  // ring of evenly spaced lights, denser on the front; a slight wave keeps the lines organic.
  const headRings = Math.round((2 * HY) / CONTOUR.head);
  const headLights = N(4500);
  const ringR = Array.from({ length: headRings }, (_, k) => Math.sqrt(Math.max(0, 1 - (1 - (2 * (k + 0.5)) / headRings) ** 2)));
  const ringSum = ringR.reduce((acc, r) => acc + r, 0);
  for (let k = 0; k < headRings; k++) {
    const dy0 = 1 - (2 * (k + 0.5)) / headRings;
    const front = Math.max(3, Math.round((headLights * ringR[k]!) / ringSum / (1 + CONTOUR.back)));
    const back = Math.max(2, Math.round(front * CONTOUR.back));
    for (let i = 0; i < front + back; i++) {
      const isFront = i < front;
      const th = isFront ? (Math.PI * (i + 0.5 + j(0.3))) / front : Math.PI + (Math.PI * (i - front + 0.5 + j(0.3))) / back;
      const dy = dy0 + 0.006 * Math.sin(th * 2 + k * 0.7) + j(0.004);
      const r = Math.sqrt(Math.max(0, 1 - dy * dy));
      const d: V3 = [Math.cos(th) * r, dy, Math.sin(th) * r];
      const p = headPoint(...d);
      // the face fades in towards the centre, so the outline stays a clean blue edge
      const face = isFront ? 0.36 + 0.14 * smooth(0.2, 0.75, d[2]) : 0.34;
      push(p, headNormal(...d), 3.4, face, KIND.skin, isFront ? SKIN_JAW * jawWeight(p[0], p[1]) : 0, 1);
    }
  }

  for (const side of [1, -1]) {
    const sx = (x: number) => x * side;

    // --- arm: deltoid, upper arm, forearm
    const [S, E, Wr] = [JOINTS.shoulder, JOINTS.elbow, JOINTS.wrist].map((v) => [sx(v[0]), v[1], v[2]] as V3) as [V3, V3, V3];
    sphere(haze, rnd, N(170), [sx(1.74), -2.62, 0], [0.52, 0.5, 0.52], (p) => !insideTorso(...p) && p[0] * side > 1.35, 2.0, 0.9, KIND.body);
    tube(haze, rnd, N(300), S, E, profile([[0, 0.48], [0.45, 0.47], [1, 0.36]]), () => 0.92, (p) => !insideTorso(...p), 2.0, 0.9, KIND.body);
    tube(haze, rnd, N(250), E, Wr, profile([[0, 0.38], [0.25, 0.4], [1, 0.22]]), () => 0.9, () => true, 2.0, 0.9, KIND.body);

    // --- hand: palm facing the thigh, four fingers, a thumb
    const palm: V3 = [sx(2.33), -8.55, 0.18];
    sphere(haze, rnd, N(130), palm, [0.14, 0.42, 0.34], () => true, 1.8, 0.82, KIND.hand);
    for (let f = 0; f < 4; f++) {
      const z = 0.0 + (f - 1.5) * 0.15 + 0.18;
      const len = [0.66, 0.8, 0.74, 0.58][f]!;
      tube(haze, rnd, N(30), [sx(2.32), -8.9, z], [sx(2.28 + f * 0.01), -8.9 - len, z + 0.04], profile([[0, 0.075], [1, 0.05]]), () => 0.9, () => true, 1.5, 0.85, KIND.hand);
    }
    tube(haze, rnd, N(30), [sx(2.3), -8.3, 0.45], [sx(2.2), -8.95, 0.62], profile([[0, 0.085], [1, 0.06]]), () => 0.9, () => true, 1.5, 0.85, KIND.hand);

    // --- leg: thigh, calf with its bulge, foot pointing forward
    const [Hp, K, A] = [JOINTS.hip, JOINTS.knee, JOINTS.ankle].map((v) => [sx(v[0]), v[1], v[2]] as V3) as [V3, V3, V3];
    tube(haze, rnd, N(420), Hp, K, profile([[0, 0.74], [0.3, 0.7], [1, 0.45]]), () => 1.0, (p) => !insideTorso(...p, 1.0), 2.0, 0.88, KIND.body);
    tube(haze, rnd, N(340), K, A, profile([[0, 0.46], [0.28, 0.5], [0.75, 0.32], [1, 0.24]]), () => 1.0, () => true, 2.0, 0.88, KIND.body);
    sphere(haze, rnd, N(130), [sx(0.78), -13.98, 0.36], [0.28, 0.18, 0.62], (p) => p[1] > -14.15, 1.8, 0.9, KIND.body);
  }

  // --- neck: contour rings that follow the head as it turns
  const neckRx = profile([[-1.8, 0.58], [-1.3, 0.5], [-0.55, 0.46]]);
  contourColumn(push, rnd, N(600), -0.55, -1.8, CONTOUR.neck, neckRx, (y) => neckRx(y) * 1.04, (y) => -0.12 + 0.07 * smooth(-0.55, -1.8, y), {
    back: CONTOUR.back,
    keep: (p) => !insideHead(...p),
    headW: (y) => 1 - smooth(0.25, 0.9, (-0.55 - y) / 1.25),
  });

  // --- torso: the same contour lines from the trapezius over the chest, thinning out towards the
  // ribs; below, where the closeup has faded out, a soft haze is enough volume for the full body
  const RIBS = -5.0;
  contourColumn(push, rnd, N(2600), TORSO_TOP - 0.03, RIBS, CONTOUR.torso, torsoRx, torsoRz, () => 0, {
    back: CONTOUR.torsoBack,
    keep: () => true,
    light: (y) => 1 - 0.7 * smooth(-3.9, RIBS, y),
  });
  const lower = (t: number) => lerp(RIBS + 0.6, TORSO_BOTTOM, t);
  tube(haze, rnd, N(900), [0, RIBS + 0.6, 0], [0, TORSO_BOTTOM, 0], (t) => torsoRx(lower(t)), (t) => torsoRz(lower(t)) / torsoRx(lower(t)), () => true, 2.0, 0.88, KIND.body);

  // A narrow speech light opens with the audio envelope, rather than detailed lips.
  for (const upper of [true, false]) {
    for (let i = 0; i < N(90); i++) {
      const t = rnd() * 2 - 1;
      const x = t * 0.19;
      const y = MOUTH_Y + (upper ? 0.006 : -0.006) + j(0.008);
      push([x, y, (headFront(x, y) ?? 0.75) + 0.01], [0, 0, 1], 1.4, 0.18, upper ? KIND.lipUpper : KIND.lipLower, 1 - t * t, 1);
    }
  }
  for (let i = 0; i < N(70); i++) {
    const x = (rnd() * 2 - 1) * 0.18;
    push([x, MOUTH_Y + j(0.025), (headFront(x, MOUTH_Y) ?? 0.75) + 0.01], [0, 0, 1], 1.8, 0.45, KIND.mouthCore, 0, 1);
  }

  // --- floor: holographic rings under the feet (drawn as ellipses: y carries the fake tilt)
  for (let i = 0; i < N(620); i++) {
    const ring = [2.2, 3.0, 3.9, 0][Math.floor(rnd() * 4)]!;
    const r = ring || 0.5 + Math.sqrt(rnd()) * 3.6;
    const a = rnd() * Math.PI * 2;
    push([Math.cos(a) * r, SOLE + Math.sin(a) * r * 0.16, Math.sin(a) * r], [0, 1, 0], ring ? 1.7 : 1.3, ring ? 0.7 : 0.22, KIND.floor);
  }

  const data = new Float32Array(out);
  return { data, count: data.length / STRIDE, counts };
}

/** Surface of an ellipsoid. */
function sphere(push: Push, rnd: () => number, n: number, c: V3, r: V3, keep: (p: V3) => boolean, size: number, bright: number, kind: number) {
  for (let i = 0; i < n; i++) {
    const d = norm([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
    const p: V3 = [c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]];
    if (!keep(p)) continue;
    push(p, norm([d[0] / r[0], d[1] / r[1], d[2] / r[2]]), size, bright, kind);
  }
}

/** Bust contour lights: smaller and brighter than the haze, so the lines stay readable. */
const LINE = { size: 3.4, bright: 0.75 } as const;
type ContourOpts = {
  /** share of each ring on the far side */
  back: number;
  keep: (p: V3) => boolean;
  /** brightness over y (1 = LINE.bright) */
  light?: (y: number) => number;
  /** how much a ring follows the head turn */
  headW?: (y: number) => number;
};

/**
 * Horizontal contour lines on a vertical column with an elliptic cross-section rx(y) x rz(y),
 * from y0 down to y1. Lines are `step` apart; each is a ring of evenly spaced lights, `back`
 * of them on the far side. Normals include the slope, so shoulders catch light from above.
 */
function contourColumn(
  push: Push,
  rnd: () => number,
  n: number,
  y0: number,
  y1: number,
  step: number,
  rx: (y: number) => number,
  rz: (y: number) => number,
  cz: (y: number) => number,
  { back, keep, light, headW }: ContourOpts,
) {
  const lines = Math.max(2, Math.round((y0 - y1) / step));
  const ys = Array.from({ length: lines }, (_, k) => y0 - ((k + 0.5) * (y0 - y1)) / lines);
  const w = ys.map((y) => rx(y) + rz(y));
  const sum = w.reduce((acc, v) => acc + v, 0);
  const e = 0.01;
  ys.forEach((yk, k) => {
    const front = Math.max(4, Math.round((n * w[k]!) / sum / (1 + back)));
    const nb = Math.max(2, Math.round(front * back));
    const a = rx(yk), c = rz(yk);
    const da = (rx(yk + e) - rx(yk - e)) / (2 * e), dc = (rz(yk + e) - rz(yk - e)) / (2 * e);
    for (let i = 0; i < front + nb; i++) {
      const th = i < front ? (Math.PI * (i + 0.5 + (rnd() - 0.5) * 0.3)) / front : Math.PI + (Math.PI * (i - front + 0.5 + (rnd() - 0.5) * 0.3)) / nb;
      const co = Math.cos(th), si = Math.sin(th);
      const y = yk + 0.008 * Math.sin(th * 2 + k * 0.9) + (rnd() - 0.5) * 0.006;
      const p: V3 = [co * a, y, cz(yk) + si * c];
      if (!keep(p)) continue;
      push(p, norm([co / a, -(co * co * da) / a - (si * si * dc) / c, si / c]), LINE.size, LINE.bright * (light ? light(yk) : 1), KIND.line, 0, headW ? headW(yk) : 0);
    }
  });
}

/**
 * Surface of a tube from a to b with an elliptic cross-section: `rx(t)` across, `ratio(t)` the
 * depth over width. Area-weighted along the axis. `headW(t)` lets the neck follow the head.
 */
function tube(
  push: Push,
  rnd: () => number,
  n: number,
  a: V3,
  b: V3,
  rx: (t: number) => number,
  ratio: (t: number) => number,
  keep: (p: V3) => boolean,
  size: number,
  bright: number,
  kind: number,
  headW?: (t: number) => number,
) {
  const axis = sub(b, a);
  const len = Math.hypot(...axis);
  const u = norm(axis);
  const side = norm(cross(u, [0, 0, 1]));
  const fwd = cross(side, u);
  const flip = side[0] < 0 ? -1 : 1; // keep "side" pointing to +x
  const S = 48;
  const cdf: number[] = [];
  let acc = 0;
  for (let i = 0; i < S; i++) {
    const t = (i + 0.5) / S;
    acc += rx(t) * (1 + ratio(t));
    cdf.push(acc);
  }
  for (let i = 0; i < n; i++) {
    const pick = rnd() * acc;
    let k = 0;
    while (k < S - 1 && cdf[k]! < pick) k++;
    const t = (k + rnd()) / S;
    const th = rnd() * Math.PI * 2;
    const r = rx(t);
    const rz = r * ratio(t);
    const c = Math.cos(th);
    const s = Math.sin(th);
    const p: V3 = [
      a[0] + u[0] * t * len + side[0] * flip * c * r + fwd[0] * s * rz,
      a[1] + u[1] * t * len + side[1] * flip * c * r + fwd[1] * s * rz,
      a[2] + u[2] * t * len + side[2] * flip * c * r + fwd[2] * s * rz,
    ];
    if (!keep(p)) continue;
    const nn = norm([
      side[0] * flip * (c / r) + fwd[0] * (s / rz),
      side[1] * flip * (c / r) + fwd[1] * (s / rz),
      side[2] * flip * (c / r) + fwd[2] * (s / rz),
    ]);
    push(p, nn, size, bright, kind, 0, headW ? headW(t) : 0);
  }
}

// ---------------------------------------------------------------------------------- stats

export type CloudStats = {
  count: number;
  min: V3;
  max: V3;
  meanX: number;
  /** particles of `kind` inside the box [x0,x1]x[y0,y1] */
  inBox: (x0: number, x1: number, y0: number, y1: number, kinds?: number[]) => number;
  /** max |x| among non-floor particles in a y band */
  widthAt: (y0: number, y1: number) => number;
};

export function cloudStats(c: AvatarCloud): CloudStats {
  const d = c.data;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  let sx = 0;
  let body = 0;
  for (let i = 0; i < c.count; i++) {
    const o = i * STRIDE;
    if (d[o + 8] === KIND.floor) continue;
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a]!, d[o + a]!);
      max[a] = Math.max(max[a]!, d[o + a]!);
    }
    sx += d[o]!;
    body++;
  }
  return {
    count: c.count,
    min,
    max,
    meanX: sx / body,
    inBox(x0, x1, y0, y1, kinds) {
      let n = 0;
      for (let i = 0; i < c.count; i++) {
        const o = i * STRIDE;
        const x = d[o]!;
        const y = d[o + 1]!;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && (!kinds || kinds.includes(d[o + 8]!))) n++;
      }
      return n;
    },
    widthAt(y0, y1) {
      let w = 0;
      for (let i = 0; i < c.count; i++) {
        const o = i * STRIDE;
        const y = d[o + 1]!;
        if (d[o + 8] !== KIND.floor && y >= y0 && y <= y1) w = Math.max(w, Math.abs(d[o]!));
      }
      return w;
    },
  };
}
