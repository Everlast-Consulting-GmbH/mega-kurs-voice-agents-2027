"use client";
import { useRef } from "react";
import type { SystemNode } from "@/lib/avatar/systems";
import { usePaintedCanvas } from "./canvas";
import { ACTIVE, DONE, ERROR, MONO } from "./palette";

// Decorative "Systemnetz": a dotted sphere with Jarvis' six systems on an orbit around it.
// The sphere is not a map and claims no real traffic; only the satellites carry state (amber =
// working right now). Cost: ~1k dots on a 2D canvas at 30 fps, still frames for reduced motion.

const DOTS = (() => {
  const n = 1100;
  const out = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out[i * 3] = Math.cos(golden * i) * r;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(golden * i) * r;
  }
  return out;
})();

const SHORT: Record<SystemNode["id"], string> = { mail: "MAIL", crm: "CRM", calendar: "KAL", team: "TEAM", computer: "PC", web: "WEB" };
const satColor = (n: SystemNode) => (n.tone === "active" ? ACTIVE : n.tone === "done" ? DONE : n.tone === "error" ? ERROR : "#a9c8d8");

export function Globe({ nodes, width, height }: { nodes: SystemNode[]; width: number; height: number }) {
  const state = useRef(nodes);
  state.current = nodes;
  const ref = usePaintedCanvas((ctx, w, h, t, reduced) => {
    const cx = w / 2;
    const cy = h / 2 + 4;
    const R = Math.min(w, h) * 0.34;
    const rot = reduced ? 0.6 : t * 0.12;
    const tilt = 0.36;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const cr = Math.cos(rot), sr = Math.sin(rot);

    // atmosphere
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R * 1.25);
    g.addColorStop(0, "rgba(150,200,226,0.16)");
    g.addColorStop(0.7, "rgba(90,140,170,0.05)");
    g.addColorStop(1, "rgba(90,140,170,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
    ctx.fill();

    // dots: rotate about y, tilt about x, orthographic
    for (let i = 0; i < DOTS.length; i += 3) {
      const x0 = DOTS[i]!, y0 = DOTS[i + 1]!, z0 = DOTS[i + 2]!;
      const x1 = x0 * cr + z0 * sr;
      const z1 = -x0 * sr + z0 * cr;
      const y2 = y0 * ct - z1 * st;
      const z2 = y0 * st + z1 * ct;
      const front = z2 > 0;
      const a = front ? 0.18 + z2 * 0.62 : 0.05;
      ctx.fillStyle = `rgba(190,222,240,${a.toFixed(3)})`;
      const s = front ? 1.1 + z2 * 0.7 : 0.8;
      ctx.fillRect(cx + x1 * R - s / 2, cy - y2 * R - s / 2, s, s);
    }

    // rim and equator
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(169,200,216,0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(169,200,216,0.16)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * st, 0, 0, Math.PI * 2);
    ctx.stroke();

    // orbit with the six systems
    const orx = R * 1.62, ory = R * 0.46, oa = -0.16;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(oa);
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = "rgba(169,200,216,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, 0, orx, ory, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const list = state.current;
    const ca = Math.cos(oa), sa = Math.sin(oa);
    ctx.font = `600 9.5px ${MONO}`;
    ctx.textBaseline = "middle";
    list.forEach((n, i) => {
      const ang = (i / list.length) * Math.PI * 2 + (reduced ? 0 : t * 0.05);
      const ex = Math.cos(ang) * orx, ey = Math.sin(ang) * ory;
      const x = cx + ex * ca - ey * sa;
      const y = cy + ex * sa + ey * ca;
      const behind = Math.sin(ang) < 0 && Math.hypot(x - cx, y - cy) < R;
      const c = satColor(n);
      const live = n.tone !== "idle";
      ctx.globalAlpha = behind ? 0.25 : 1;
      if (live) {
        // a link down to the surface and a travelling light while the system works
        const dx = cx - x, dy = cy - y;
        const len = Math.hypot(dx, dy) || 1;
        const sx = cx - (dx / len) * R, sy = cy - (dy / len) * R;
        ctx.strokeStyle = c;
        ctx.globalAlpha = behind ? 0.2 : 0.75;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        if (n.tone === "active" && !reduced) {
          const k = (t * 1.4 + i * 0.3) % 1;
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x + (sx - x) * k, y + (sy - y) * k, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = (1 - ((t * 1.2) % 1)) * 0.6;
          ctx.strokeStyle = c;
          ctx.beginPath();
          ctx.arc(x, y, 4 + ((t * 1.2) % 1) * 9, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = behind ? 0.25 : 1;
      }
      ctx.shadowColor = c;
      ctx.shadowBlur = live ? 10 : 4;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, live ? 3.4 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = live ? c : "rgba(200,225,238,0.6)";
      const right = x >= cx;
      ctx.textAlign = right ? "left" : "right";
      ctx.fillText(SHORT[n.id], x + (right ? 8 : -8), y);
      ctx.globalAlpha = 1;
    });
  });
  return <canvas ref={ref} aria-hidden="true" data-testid="deck-globe" style={{ width, height, display: "block" }} />;
}
