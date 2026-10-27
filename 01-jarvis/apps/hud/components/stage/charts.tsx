"use client";
import { motion } from "motion/react";
import type { Widget } from "@/lib/events/reducer";
import { axisLabel, fmtNumber, widgetUnit } from "@/lib/stage";
import { makeProjection, outlinePath } from "@/lib/geo";
import { compact, toPoints, toRows, toSeries, toStat } from "@/lib/widgetData";
import { EASE } from "./layout";

// The evidence under a stage headline: big, quiet, one highlighted value in peach.

const PEACH = "#ffc9a3";
type Area = { w: number; h: number };
type ChartProps = { widget: Widget; highlight: number | null; area: Area };

const LABEL_H = 34;

export function BarChart({ widget, highlight, area }: ChartProps) {
  const series = toSeries(widget.data);
  const max = Math.max(...series.map((p) => p.value), 1);
  const h = Math.min(320, area.h * 0.72);
  return (
    <div className="mt-[12px] flex items-end" style={{ height: h + LABEL_H, gap: series.length > 8 ? 14 : 38 }}>
      {series.map((p, i) => {
        const hl = i === highlight;
        return (
          <div key={`${p.label}-${i}`} className="flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }} data-testid="stage-bar" data-hl={hl || undefined}>
            <motion.div
              className="w-full origin-bottom"
              style={{
                height: Math.max(4, (p.value / max) * h),
                borderRadius: "12px 12px 4px 4px",
                background: hl ? "linear-gradient(#ffd3b4, #c4708a)" : "linear-gradient(#e8eaff, #6f74b8)",
              }}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.7, ease: EASE }}
            />
            <div className="mt-[10px] truncate text-[20px]" style={{ color: hl ? PEACH : "#b9bde6", height: LABEL_H - 10 }}>
              {axisLabel(p.label)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LineChart({ widget, highlight, area }: ChartProps) {
  const series = toSeries(widget.data);
  const h = Math.min(320, area.h * 0.72);
  const w = area.w;
  if (series.length < 2) return <BarChart widget={widget} highlight={highlight} area={area} />;
  const lo = Math.min(...series.map((p) => p.value));
  const hi = Math.max(...series.map((p) => p.value));
  const span = hi - lo || 1;
  const pad = 14;
  const pts = series.map((p, i) => [pad + (i / (series.length - 1)) * (w - pad * 2), pad + (1 - (p.value - lo) / span) * (h - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const step = Math.max(1, Math.ceil(series.length / 8));
  return (
    <div>
      <svg width={w} height={h} className="overflow-visible">
        <defs>
          <linearGradient id="line-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#c9cdf0" stopOpacity="0.25" />
            <stop offset="1" stopColor="#c9cdf0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path d={`${line}L${pts.at(-1)![0]},${h}L${pts[0]![0]},${h}Z`} fill="url(#line-area)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }} />
        <motion.path d={line} fill="none" stroke="#e8eaff" strokeWidth={3} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: EASE }} />
        {highlight !== null && pts[highlight] && <circle cx={pts[highlight][0]} cy={pts[highlight][1]} r={9} fill={PEACH} />}
      </svg>
      <div className="relative mt-[10px]" style={{ height: LABEL_H }}>
        {series.map((p, i) =>
          i % step === 0 || i === series.length - 1 ? (
            <span key={i} className="absolute -translate-x-1/2 text-[20px]" style={{ left: pts[i]![0], color: i === highlight ? PEACH : "#b9bde6" }}>
              {axisLabel(p.label)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

export function MapChart({ widget, highlight, area, dataset }: ChartProps & { dataset?: string }) {
  const pts = toPoints(widget.data);
  const unit = widgetUnit(widget, dataset);
  const h = Math.min(area.h, 470);
  const mw = Math.round(h * 0.78);
  const project = makeProjection(mw, h, 10);
  const max = Math.max(...pts.map((p) => p.value), 1);
  const ranked = pts.map((p, i) => ({ ...p, i })).sort((a, b) => b.value - a.value).slice(0, 5);
  return (
    <div className="flex items-start gap-14">
      <svg width={mw} height={h} className="shrink-0 overflow-visible">
        <path d={outlinePath(project)} fill="rgba(255,255,255,0.04)" stroke="rgba(201,205,240,0.35)" strokeWidth={1.5} strokeLinejoin="round" />
        {pts.map((p, i) => {
          const [x, y] = project(p.lng, p.lat);
          const hl = i === highlight;
          return (
            <motion.g key={p.label} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.08, duration: 0.6, ease: EASE }} style={{ transformOrigin: `${x}px ${y}px` }}>
              <circle cx={x} cy={y} r={8 + Math.sqrt(p.value / max) * 22} fill={hl ? "rgba(255,201,163,0.35)" : "rgba(201,205,240,0.18)"} stroke={hl ? PEACH : "#c9cdf0"} strokeWidth={1.5} />
              <circle cx={x} cy={y} r={4} fill={hl ? PEACH : "#fff"} />
            </motion.g>
          );
        })}
      </svg>
      <div className="flex flex-1 flex-col gap-[14px] pt-2">
        {ranked.map((p, k) => (
          <motion.div key={p.label} className="flex items-baseline justify-between border-b pb-[12px]" style={{ borderColor: "rgba(255,255,255,0.08)" }} initial={{ opacity: 0, x: 10 }} animate={{ opacity: p.i === highlight ? 1 : 0.6, x: 0 }} transition={{ delay: 0.3 + k * 0.08, duration: 0.5, ease: EASE }}>
            <span className="text-[28px]" style={{ color: p.i === highlight ? PEACH : "#fff" }}>
              {p.label}
            </span>
            <span className="text-[26px] font-light tabular-nums text-white">{fmtNumber(p.value, unit)}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function TableBlock({ widget }: { widget: Widget }) {
  const { columns, rows } = toRows(widget.data);
  const cols = columns.slice(0, 4);
  return (
    <table className="w-full text-left text-[21px]">
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c} className="pb-3 text-[18px] font-normal uppercase tracking-[0.16em]" style={{ color: "#9aa0cc" }}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 7).map((r, i) => (
          <tr key={i} className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {cols.map((c) => (
              <td key={c} className="truncate py-3 pr-6 text-white/90">
                {typeof r[c] === "number" ? compact(r[c] as number) : String(r[c] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatBlock({ widget }: { widget: Widget }) {
  const st = toStat(widget.data);
  if (!st?.label) return null;
  return <div className="text-[30px] font-light text-white/80">{st.label}</div>;
}
