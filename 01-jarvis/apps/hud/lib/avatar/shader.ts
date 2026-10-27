import { KIND, MOUTH_Y } from "./geometry";
import { BODY_HAZE, COLORS, FLOW, GAIN, HALO, JAW_DROP, LINE_FULL, SPEECH_DIM, SPEECH_GLOW, UPPER_LIP_LIFT, VIEW_TILT } from "./motion";

// GLSL twin of shadeParticle() in motion.ts. Geometry is uploaded once; per frame only uniforms
// change, so 13k particles cost the CPU nothing.

const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
const v3 = (c: readonly number[]) => `vec3(${c.map(f).join(", ")})`;

export const AVATAR_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec4 aA; // size, bright, kind, seed
attribute vec2 aB; // jaw, headW
uniform vec4 uCam;    // cx, cy, s, device px per design px
uniform vec4 uMotion; // headYaw, headPitch, bodyYaw, breath
uniform vec4 uVoice;  // open, level, listen, think
uniform vec4 uLook;   // fadeFrom, fadeTo, scan, zoom
uniform vec4 uMood;   // dim, warm, blush, beat
uniform vec2 uTime;   // time, intro
uniform float uHalo;
uniform float uEmber; // warm speech light
uniform vec2 uView;   // design width, height
varying vec3 vColor;
varying float vAlpha;
varying float vSize;
varying float vSoft;

float ss(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

void main() {
  float kind = aA.z, seed = aA.w, jaw = aB.x, headW = aB.y;
  float isFeat = step(${f(KIND.feature - 0.5)}, kind) * step(kind, ${f(KIND.mouthCore + 0.5)});
  float isLip = step(${f(KIND.lipUpper - 0.5)}, kind) * step(kind, ${f(KIND.lipLower + 0.5)});
  float isUpper = step(${f(KIND.lipUpper - 0.5)}, kind) * step(kind, ${f(KIND.lipUpper + 0.5)});
  float isCore = step(${f(KIND.mouthCore - 0.5)}, kind) * step(kind, ${f(KIND.mouthCore + 0.5)});
  float isFloor = step(${f(KIND.floor - 0.5)}, kind) * step(kind, ${f(KIND.floor + 0.5)});
  float isLine = step(${f(KIND.line - 0.5)}, kind);
  float isBody = step(${f(KIND.body - 0.5)}, kind) * step(kind, ${f(KIND.hand + 0.5)}) + isLine;
  float open = uVoice.x;
  vec3 p = aPos;
  vec3 n = aNrm;

  p.y += open * jaw * mix(${f(-JAW_DROP)}, ${f(UPPER_LIP_LIFT)}, isUpper);
  p.y = mix(p.y, ${f(MOUTH_Y)} + (aPos.y - ${f(MOUTH_Y)}) * open * 1.2 - open * 0.057, isCore);

  float torso = ss(1.6, 2.4, -aPos.y) * (1.0 - ss(6.0, 8.5, -aPos.y));
  p.x *= 1.0 + uMotion.w * 0.012 * torso;
  p.z *= 1.0 + uMotion.w * 0.025 * torso;
  p.y += uMotion.w * 0.03 * torso;

  float a = uMotion.x * headW, q = uMotion.y * headW;
  float cp = cos(q), sp = sin(q), ca = cos(a), sa = sin(a);
  float ry = p.y + 1.0, rz = p.z + 0.1;
  float y1 = ry * cp - rz * sp, z1 = ry * sp + rz * cp;
  p = vec3(p.x * ca + z1 * sa, y1 - 1.0, -p.x * sa + z1 * ca - 0.1);
  float ny1 = n.y * cp - n.z * sp, nz1 = n.y * sp + n.z * cp;
  n = vec3(n.x * ca + nz1 * sa, ny1, -n.x * sa + nz1 * ca);

  float b = uMotion.z * (1.0 - isFloor);
  float cb = cos(b), sb = sin(b);
  p = vec3(p.x * cb + p.z * sb, p.y, -p.x * sb + p.z * cb);
  n = vec3(n.x * cb + n.z * sb, n.y, -n.x * sb + n.z * cb);

  float tl = ${f(VIEW_TILT)} * (1.0 - uLook.w) * (1.0 - isFloor);
  float ct = cos(tl), st = sin(tl);
  p = vec3(p.x, p.y * ct - p.z * st, p.y * st + p.z * ct);
  n = vec3(n.x, n.y * ct - n.z * st, n.y * st + n.z * ct);

  float delay = 0.1 + seed * 0.8 + clamp(-aPos.y / 15.0, 0.0, 1.0) * 0.7;
  float e = clamp((uTime.y - delay) / 1.3, 0.0, 1.0);
  float ease = 1.0 - pow(1.0 - e, 3.0);
  float k = (1.0 - ease) * (2.5 + seed * 5.0);
  p += vec3(sin(seed * 91.7), cos(seed * 53.3), sin(seed * 27.1 + 1.3)) * k;

  float persp = 1.0 / (1.0 - p.z * 0.03);
  vec2 scr = vec2(uCam.x + p.x * uCam.z * persp, uCam.y - p.y * uCam.z * persp);
  vec2 c = scr / uView * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);

  vec3 L = normalize(vec3(-0.6, 0.45, 0.66));
  float diff = max(0.0, dot(n, L));
  float rim = pow(clamp(1.0 - abs(n.z), 0.0, 1.0), 3.0);
  float shell = ((0.12 + 0.88 * ss(-0.2, 0.9, n.z)) * (0.3 + 1.05 * diff) + rim * 1.1) * ${f(GAIN)};
  float bright = aA.y;
  float alpha = bright * mix(shell, ${f(GAIN)}, isFeat);
  alpha = mix(alpha, bright * uLook.w * ${f(GAIN)}, isFloor);
  alpha *= mix(1.0, open, isCore);
  alpha *= 1.0 - isLip * 0.9 * (1.0 - open);
  float mg = exp(-(aPos.x * aPos.x + (aPos.y + 0.53) * (aPos.y + 0.53)) / 0.035) * open * (1.0 - isFloor);
  alpha += isLip * open * 0.14 + mg * 0.12;
  float bd = (aPos.y - uLook.z) / 0.22;
  float band = exp(-bd * bd) * (1.0 - isFeat * 0.5) * (1.0 - isFloor);
  alpha += band * 0.28;
  alpha += pow(0.5 + 0.5 * sin(aPos.y * 7.0 - uTime.x * 9.0), 8.0) * uVoice.w * 0.45 * (1.0 - isFloor);
  float fade = (1.0 - ss(uLook.x, uLook.y, -aPos.y)) * mix(1.0, 0.38 + uLook.w * 0.62, step(1.5, kind) * (1.0 - isFloor) * (1.0 - isFeat));
  float dens = clamp(pow(uCam.z / 130.0, 0.5), 0.7, 1.0) * (1.0 + uLook.w * mix(0.25, 0.35, isBody) * (1.0 - isFeat)) * mix(1.0, ${f(LINE_FULL)}, isLine * uLook.w);
  alpha *= fade * uMood.x * ease * dens * (1.0 + uVoice.y * 0.12) * (1.0 + uMood.w * 0.35) * (1.0 + uVoice.z * 0.15 * isFeat);
  alpha *= 1.0 - isBody * ${f(1 - BODY_HAZE.alpha)};
  float flow = 1.0 + ${f(FLOW.amount)} * sin(atan(aPos.x, aPos.z + 0.0001) * 3.0 + aPos.y * 4.0 - uTime.x * ${f(FLOW.speed)}) * (1.0 - isFloor) * (1.0 - isFeat);
  float ez = exp(-(aPos.x * aPos.x / 0.42 + (aPos.y + 0.45) * (aPos.y + 0.45) / 0.75)) + 0.8 * exp(-(aPos.x * aPos.x / 0.09 + (aPos.y + 1.35) * (aPos.y + 1.35) / 0.3));
  float ember = uEmber * ez * ss(-0.1, 0.8, n.z) * (1.0 - rim) * (1.0 - isFloor);
  alpha *= flow * (1.0 + ember * 0.3);
  vAlpha = clamp(alpha, 0.0, 1.5) * mix(1.0, mix(${f(HALO.alpha)}, ${f(BODY_HAZE.haloAlpha)}, isBody), uHalo);

  vec3 col = mix(${v3(COLORS.shadow)}, ${v3(COLORS.cyan)}, ss(0.05, 0.85, diff));
  float w = clamp(pow(diff, 5.0) * 0.7 + isFeat * (0.45 - isLip * 0.3) + band * 0.5 + isLip * open * 0.22 + mg * 0.25 + isCore * 0.2, 0.0, 1.0);
  col = mix(col, ${v3(COLORS.white)}, w);
  col = mix(col, ${v3(COLORS.lip)}, isLip * (1.0 - open) * 0.45);
  col += ${v3(COLORS.rim)} * rim * (1.0 - isFeat) * 0.8;
  col = mix(col, ${v3(COLORS.warm)}, clamp(uMood.y * 0.55 + uMood.z * 0.7, 0.0, 0.85));
  col = mix(col, ${v3(COLORS.ember)}, clamp(ember * 0.85, 0.0, 0.75));
  col = mix(col, ${v3(COLORS.emberHot)}, (isLip + isCore) * uEmber * 0.85);
  vColor = col * (1.0 - isLip * ${f(1 - SPEECH_DIM.lip)} - isCore * ${f(1 - SPEECH_DIM.core)});

  float size = aA.x * clamp(uCam.z / 130.0, 0.85, 1.35) * (1.0 + band * 0.35 + mg * 0.3 + isCore * open * 0.4) * mix(1.0, ${f(BODY_HAZE.size)}, isBody) * (1.0 + (isLip + isCore) * ${f(SPEECH_GLOW - 1)});
  gl_PointSize = max(1.5, size * uCam.w) * mix(1.0, mix(${f(HALO.size)}, ${f(BODY_HAZE.haloSize)}, isBody), uHalo);
  vSize = gl_PointSize;
  vSoft = clamp(isBody + (isLip + isCore) * 0.85, 0.0, 1.0);
  if (vAlpha < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

export const AVATAR_FRAGMENT = /* glsl */ `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
varying float vSize;
varying float vSoft;
void main() {
  float d = length(gl_PointCoord - 0.5);
  // Every point has a feathered edge; body haze uses a much wider falloff, so the figure
  // below the head reads as a blurred volume rather than a field of sharp dots.
  float soft = exp(-d * d * mix(16.0, 7.0, vSoft));
  float a = vAlpha * soft * (1.0 - smoothstep(mix(0.42, 0.22, vSoft), 0.5, d));
  if (a <= 0.002) discard;
  gl_FragColor = vec4(vColor * a, a);
}`;
