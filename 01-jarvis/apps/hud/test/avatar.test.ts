import { describe, expect, it } from "vitest";
import { buildAvatar, cloudStats, CROWN, EYE, KIND, MOUTH_Y, SOLE, STRIDE } from "@/lib/avatar/geometry";
import { avatarAnchors, avatarCamera, closeupCamera, FULL_BODY, fullBodyCamera, project } from "@/lib/avatar/camera";
import { BODY_HAZE, emberTarget, followMouth, HALO, mouthTarget, shadeParticle, type AvatarFrame, type ParticleOut } from "@/lib/avatar/motion";
import { AVATAR_VERTEX } from "@/lib/avatar/shader";

const cloud = buildAvatar();
const stats = cloudStats(cloud);
const face = [KIND.feature, KIND.iris, KIND.eyeWhite, KIND.lipUpper, KIND.lipLower];

const frame = (over: Partial<AvatarFrame> = {}): AvatarFrame => ({
  cx: 960, cy: 432, s: 200, headYaw: 0, headPitch: 0, bodyYaw: 0, breath: 0, open: 0, level: 0, listen: 0, think: 0,
  fadeFrom: 2.7, fadeTo: 5.8, scan: 99, zoom: 0, dim: 1, warm: 0, blush: 0, beat: 0, time: 0, intro: 99, ember: 0, ...over,
});
const shade = (i: number, f: AvatarFrame) => shadeParticle(cloud.data, i, f, { x: 0, y: 0, size: 0, alpha: 0, r: 0, g: 0, b: 0 } as ParticleOut);
const ofKind = (k: number) => Array.from({ length: cloud.count }, (_, i) => i).filter((i) => cloud.data[i * STRIDE + 8] === k);

describe("avatar point cloud", () => {
  it("stays in the 6k-15k budget and is deterministic", () => {
    expect(cloud.count).toBeGreaterThan(6000);
    expect(cloud.count).toBeLessThan(15000);
    expect(buildAvatar().data).toEqual(cloud.data);
    expect(buildAvatar({ seed: 8 }).data).not.toEqual(cloud.data);
  });

  it("has human proportions: ~7.5 heads, shoulders wider than head and hips, symmetric", () => {
    const height = stats.max[1] - stats.min[1];
    expect(height / 2.05).toBeGreaterThan(7);
    expect(height / 2.05).toBeLessThan(8.2);
    expect(stats.max[1]).toBeCloseTo(CROWN + 0.1, 0);
    expect(stats.min[1]).toBeGreaterThan(SOLE - 0.1);
    expect(Math.abs(stats.meanX)).toBeLessThan(0.05);
    const head = stats.widthAt(-0.2, 0.4);
    const shoulders = stats.widthAt(-3.0, -2.5);
    const waist = cloudStats({ ...cloud, data: torsoOnly() }).widthAt(-6.2, -6.0);
    const hips = cloudStats({ ...cloud, data: torsoOnly() }).widthAt(-7.6, -7.0);
    expect(head).toBeLessThan(0.86);
    expect(shoulders).toBeGreaterThan(head * 2.6);
    expect(shoulders).toBeGreaterThan(hips);
    expect(hips).toBeGreaterThan(waist);
  });

  it("keeps an abstract face without eyes, eyebrows, hair or a sculpted nose", () => {
    for (const kind of ["hair", "feature", "iris", "eyeWhite"] as const) expect(cloud.counts[kind]).toBe(0);
    expect(cloud.counts.skin).toBeGreaterThan(3500);
    expect(cloud.counts.mouthCore).toBeGreaterThan(0);
  });

  it("draws head, neck and chest as horizontal contour lines", () => {
    const levels = (kind: number, y0: number, y1: number) => {
      const ys = ofKind(kind).map((i) => cloud.data[i * STRIDE + 1]!).filter((y) => y > y0 && y < y1);
      return { n: ys.length, lines: new Set(ys.map((y) => Math.round(y / 0.03))).size };
    };
    const bust = levels(KIND.line, -4.5, -0.6);
    expect(cloud.counts.line).toBeGreaterThan(2500);
    expect(bust.n / bust.lines).toBeGreaterThan(25); // many lights share few heights: lines, not a speckle
    const head = levels(KIND.skin, -0.9, 0.9);
    expect(head.n / head.lines).toBeGreaterThan(30);
  });

  it("has a full body: arms, hands, legs, feet", () => {
    expect(stats.inBox(1.6, 2.8, -8, -3, [KIND.body])).toBeGreaterThan(300); // right arm
    expect(stats.inBox(-2.8, -1.6, -8, -3, [KIND.body])).toBeGreaterThan(300);
    expect(cloud.counts.hand).toBeGreaterThan(300);
    expect(stats.inBox(0.2, 1.6, -13.8, -8.5, [KIND.body])).toBeGreaterThan(400); // right leg
    expect(stats.inBox(-1.6, -0.2, -14.2, -13.7, [KIND.body])).toBeGreaterThan(60); // left foot
  });
});

describe("avatar camera", () => {
  it("closeup puts the head centre on the pose", () => {
    const cam = avatarCamera({ cx: 960, cy: 432, r: 250 }, 0);
    expect(project(cam, 0, 0)).toEqual({ x: 960, y: 432 });
    const chin = project(cam, 0, -1).y;
    const crown = project(cam, 0, CROWN).y;
    expect(chin - crown).toBeGreaterThan(550);
    expect(chin - crown).toBeLessThan(610);
  });

  it("full body stands between 170 and 880 on the pose's x", () => {
    const cam = avatarCamera({ cx: 960, cy: 432, r: 250 }, 1);
    expect(project(cam, 0, CROWN).y).toBeCloseTo(FULL_BODY.top, 3);
    expect(project(cam, 0, SOLE).y).toBeCloseTo(FULL_BODY.bottom, 3);
    expect(cam.cx).toBe(960);
    expect(cam.fadeFrom).toBeGreaterThan(-SOLE); // nothing fades in full body
  });

  it("zooms smoothly and monotonically between the framings", () => {
    const pose = { cx: 960, cy: 432, r: 250 };
    let prev = Infinity;
    for (let z = 0; z <= 1.0001; z += 0.1) {
      const s = avatarCamera(pose, z).s;
      expect(s).toBeLessThan(prev);
      prev = s;
    }
    expect(avatarCamera(pose, 0.5).s).toBeCloseTo(Math.sqrt(closeupCamera(pose).s * fullBodyCamera(pose).s), 6);
  });

  it("the side-app pose shows head and upper body inside the left column", () => {
    const cam = avatarCamera({ cx: 182, cy: 285, r: 104 }, 0);
    const a = avatarAnchors(cam);
    expect(a.head).toEqual({ x: 182, y: 285 });
    // everything that is still visible (above the end of the bust fade) stays left of the apps (x 365)
    const visible = stats.widthAt(-cam.fadeFrom, 1.2);
    expect(cam.cx - visible * cam.s).toBeGreaterThan(0);
    expect(cam.cx + visible * cam.s).toBeLessThan(365);
    expect(cam.fadeFrom).toBeGreaterThan(4.5); // chest and arms are part of the picture
  });
});

describe("avatar motion", () => {
  const upper = ofKind(KIND.lipUpper);
  const lower = ofKind(KIND.lipLower);
  const core = ofKind(KIND.mouthCore);
  const centre = centreOf;

  it("opens the lips with the aperture and stays shut at zero", () => {
    const shut = frame();
    const open = frame({ open: 1 });
    const gap = (f: AvatarFrame) => {
      const lo = Math.min(...centre(lower).map((i) => shade(i, f).y));
      const up = Math.max(...centre(upper).map((i) => shade(i, f).y));
      return lo - up;
    };
    expect(gap(open) - gap(shut)).toBeGreaterThan(0.15 * 130 * 0.9);
    for (const i of core) expect(shade(i, shut).alpha).toBe(0);
    expect(Math.max(...core.map((i) => shade(i, open).alpha))).toBeGreaterThan(0.5);
    // nothing outside the mouth moves when he is silent
    const brow = ofKind(KIND.skin).find((i) => cloud.data[i * STRIDE + 1]! > 0.2)!;
    expect(shade(brow, open).y).toBeCloseTo(shade(brow, shut).y, 6);
  });

  it("lights the lips with speech", () => {
    const lip = centre(lower)[0]!;
    expect(shade(lip, frame({ open: 0.8 })).alpha).toBeGreaterThan(shade(lip, frame()).alpha * 1.3);
  });

  it("derives the aperture only from real output audio", () => {
    expect(mouthTarget("idle", 0.6)).toBe(0);
    expect(mouthTarget("listening", 0.6)).toBe(0);
    expect(mouthTarget("speaking", 0)).toBe(0);
    expect(mouthTarget("speaking", 0.01)).toBe(0);
    expect(mouthTarget("speaking", Number.NaN)).toBe(0);
    expect(mouthTarget("speaking", 0.2)).toBeGreaterThan(0.3);
    expect(mouthTarget("speaking", 0.5)).toBeGreaterThan(mouthTarget("speaking", 0.2));
    expect(mouthTarget("speaking", 5)).toBe(1);
    let m = 0;
    for (let i = 0; i < 6; i++) m = followMouth(m, 1, 1 / 60);
    expect(m).toBeGreaterThan(0.85); // a syllable lands within ~100 ms
    for (let i = 0; i < 60; i++) m = followMouth(m, 0, 1 / 60);
    expect(m).toBeLessThan(0.01);
  });

  it("assembles from a scattered cloud during the intro", () => {
    const i = ofKind(KIND.skin)[100]!;
    const done = shade(i, frame());
    const start = shade(i, frame({ intro: 0 }));
    expect(start.alpha).toBe(0);
    expect(Math.hypot(start.x - done.x, start.y - done.y)).toBeGreaterThan(100);
  });

  it("fades the bust below the shoulders in closeup but not in full body", () => {
    const leg = ofKind(KIND.body).find((i) => cloud.data[i * STRIDE + 1]! < -11)!;
    expect(shade(leg, frame()).alpha).toBe(0);
    expect(shade(leg, frame({ ...avatarCamera({ cx: 960, cy: 432, r: 250 }, 1), zoom: 1 })).alpha).toBeGreaterThan(0);
  });

  it("warms the inside of head and throat while speaking; the outline stays blue", () => {
    expect(emberTarget("speaking", 0.3)).toBeGreaterThan(0.45);
    expect(emberTarget("speaking", 0.6)).toBeGreaterThan(emberTarget("speaking", 0.1));
    expect(emberTarget("idle", 0.8)).toBeLessThan(0.1);
    expect(emberTarget("listening", 0.8)).toBeLessThan(0.1);
    const skin = ofKind(KIND.skin);
    const at = (x: number, y: number, front: boolean) =>
      skin.find((i) => Math.abs(cloud.data[i * STRIDE]! - x) < 0.06 && Math.abs(cloud.data[i * STRIDE + 1]! - y) < 0.05 && cloud.data[i * STRIDE + 2]! > 0 === front)!;
    const cheek = at(0.15, -0.45, true);
    const edge = skin.filter((i) => cloud.data[i * STRIDE + 5]! < 0.15 && cloud.data[i * STRIDE + 5]! > -0.15 && Math.abs(cloud.data[i * STRIDE + 1]! + 0.3) < 0.1)[0]!;
    const quiet = shade(cheek, frame());
    expect(quiet.b).toBeGreaterThan(quiet.r);
    const warm = shade(cheek, frame({ ember: 1 }));
    expect(warm.r).toBeGreaterThan(warm.b + 0.2);
    const rim = shade(edge, frame({ ember: 1 }));
    expect(rim.b).toBeGreaterThan(rim.r);
    const lip = centreOf(ofKind(KIND.lipLower))[0]!;
    expect(shade(lip, frame({ open: 0.8, ember: 1 })).r).toBeGreaterThan(shade(lip, frame({ open: 0.8, ember: 1 })).b);
  });

  it("keeps the call pose's fill cost low (both passes, retina)", () => {
    // The body halo once covered ~5 screens per frame (~42M device px); keep well under that.
    const cam = avatarCamera({ cx: 960, cy: 367, r: 230 }, 0);
    const f = frame({ ...cam, zoom: 0 });
    let px = 0;
    for (let i = 0; i < cloud.count; i++) {
      const o = shade(i, f);
      if (o.alpha < 0.004 || o.y > 1130 || o.y < -50) continue;
      const k = cloud.data[i * STRIDE + 8]!;
      const body = k === KIND.body || k === KIND.hand || k === KIND.line;
      const size = Math.max(1.5, o.size * 2);
      px += size * size + (size * (body ? BODY_HAZE.haloSize : HALO.size)) ** 2;
    }
    expect(px).toBeLessThan(24e6);
  });

  it("keeps the shader in step with the TS twin (same constants)", () => {
    expect(AVATAR_VERTEX).toContain(String(MOUTH_Y));
    expect(AVATAR_VERTEX).toContain("-0.15");
    expect(AVATAR_VERTEX).toContain("uniform float uEmber");
    expect(AVATAR_VERTEX).not.toMatch(/\$\{|undefined|NaN/);
  });
});

function centreOf(ids: number[]) {
  return ids.filter((i) => Math.abs(cloud.data[i * STRIDE]!) < 0.05);
}

function torsoOnly() {
  // drop arms and hands so the torso width reads cleanly
  const keep: number[] = [];
  for (let i = 0; i < cloud.count; i++) {
    const o = i * STRIDE;
    const k = cloud.data[o + 8]!;
    if (k === KIND.body && Math.abs(cloud.data[o]!) < 1.75) keep.push(...cloud.data.slice(o, o + STRIDE));
  }
  return new Float32Array(keep);
}
