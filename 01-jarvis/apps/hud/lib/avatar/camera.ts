import { CROWN, JOINTS, SOLE } from "./geometry";

// Camera: body units -> 1920x1080 design pixels. Two framings share one geometry:
//  - closeup: the head centre sits on pose (cx, cy); pose.r keeps its old meaning ("how big is
//    Jarvis") and sets the scale. Large poses show head and shoulders, small side poses
//    (r ~ 80-110) show head and upper body, the rest fades out softly below.
//  - full body: the whole figure stands between FULL_BODY.top (crown) and .bottom (soles),
//    horizontally on pose.cx.
// Zoom blends the two (log-scale, so the camera feels like a dolly, not a resize).

export type Pose = { cx: number; cy: number; r: number };
export type AvatarCamera = {
  /** head centre in design px */
  cx: number;
  cy: number;
  /** design px per body unit (one unit = half a head height) */
  s: number;
  /** body depth below the head centre (units) where the bust fade starts / ends */
  fadeFrom: number;
  fadeTo: number;
};

/**
 * px per unit per pose.r. Big poses are the face hero (r = 250: head ~575 px tall, as big as the
 * old 500 px sphere reads); small side poses frame wider so head and upper body fit a column.
 */
export const CLOSEUP_SCALE = { small: 0.5, big: 1.12 } as const;
export const FULL_BODY = { top: 170, bottom: 880 } as const;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function closeupCamera(pose: Pose): AvatarCamera {
  const big = clamp((pose.r - 110) / 140, 0, 1);
  // big poses keep neck and soft shoulders in frame (a bust), so the head never floats alone
  return { cx: pose.cx, cy: pose.cy, s: pose.r * lerp(CLOSEUP_SCALE.small, CLOSEUP_SCALE.big, big), fadeFrom: lerp(5.2, 2.4, big), fadeTo: lerp(8.4, 5.6, big) };
}

export function fullBodyCamera(pose: Pose, frame: { top: number; bottom: number } = FULL_BODY): AvatarCamera {
  const s = (frame.bottom - frame.top) / (CROWN - SOLE);
  return { cx: pose.cx, cy: frame.top + CROWN * s, s, fadeFrom: 40, fadeTo: 41 };
}

export function blendCamera(a: AvatarCamera, b: AvatarCamera, z: number): AvatarCamera {
  const t = clamp(z, 0, 1);
  return {
    cx: lerp(a.cx, b.cx, t),
    cy: lerp(a.cy, b.cy, t),
    s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), t)),
    fadeFrom: lerp(a.fadeFrom, b.fadeFrom, t),
    fadeTo: lerp(a.fadeTo, b.fadeTo, t),
  };
}

export function avatarCamera(pose: Pose, zoom: number): AvatarCamera {
  return blendCamera(closeupCamera(pose), fullBodyCamera(pose), zoom);
}

/** Body point -> design px (weak perspective, same as the shader). */
export function project(cam: AvatarCamera, x: number, y: number, z = 0) {
  const persp = 1 / (1 - z * 0.03);
  return { x: cam.cx + x * cam.s * persp, y: cam.cy - y * cam.s * persp };
}

/** Screen anchors for other layers (beams, links): head, mouth, chest, hands, feet. */
export function avatarAnchors(cam: AvatarCamera) {
  const p = (x: number, y: number) => project(cam, x, y);
  return {
    head: p(0, 0),
    crown: p(0, CROWN),
    mouth: p(0, -0.5),
    chest: p(0, -3.6),
    core: p(0, -5.4),
    handL: p(-JOINTS.wrist[0], -8.9),
    handR: p(JOINTS.wrist[0], -8.9),
    feet: p(0, SOLE),
    /** half width of the shoulders in px */
    shoulderHalf: 2.4 * cam.s,
  };
}
