"use client";
import { forwardRef } from "react";

// A light macOS window: traffic lights, title, opaque content. The same chrome for every app
// window and the computer-use screen, so everything Jarvis works in reads as one desktop.

export const TITLE_BAR = 40;
export const WINDOW_RADIUS = 14;

export function TrafficLights({ size = 13, onClose }: { size?: number; onClose?: () => void }) {
  return (
    <span className="flex shrink-0 items-center" style={{ gap: size * 0.62 }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c, i) => (
        i === 0 && onClose ? <button key={c} type="button" onClick={onClose} aria-label="Fenster schließen" title="Fenster schließen" className="flex shrink-0 items-center justify-center rounded-full text-[11px] leading-none text-[#7a0e09] hover:brightness-110" style={{ width: size, height: size, background: c }}>×</button> :
        <i key={c} className="block rounded-full" style={{ width: size, height: size, background: c, boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.18)" }} />
      ))}
    </span>
  );
}

export function TitleBar({ title, right, height = TITLE_BAR, onClose }: { title: React.ReactNode; right?: React.ReactNode; height?: number; onClose?: () => void }) {
  return (
    <div
      className="relative flex shrink-0 items-center px-[15px]"
      style={{ height, background: "linear-gradient(#f2f2f6, #e7e7ee)", borderBottom: "1px solid #d8d8e0", color: "#4a4a55" }}
    >
      <TrafficLights onClose={onClose} />
      <span className="ml-[14px] truncate text-[15px] font-medium tracking-[0.005em]">{title}</span>
      {right && <span className="ml-auto flex items-center gap-2 text-[13px] text-[#80808c]">{right}</span>}
    </div>
  );
}

type Props = { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; overlay?: React.ReactNode; testId?: string; app?: string; ring?: string | null; onClose?: () => void };

/** Outer box is unclipped (cursor labels may stick out); the window itself is clipped and rounded. */
export const WindowShell = forwardRef<HTMLDivElement, Props>(function WindowShell({ title, right, children, overlay, testId, app, ring, onClose }, ref) {
  return (
    <div ref={ref} data-testid={testId} data-app={app} className="relative h-full w-full">
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-white"
        style={{
          borderRadius: WINDOW_RADIUS,
          color: "#1f2330",
          boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.28)${ring ? `, 0 0 0 3px ${ring}` : ""}`,
          transition: "box-shadow 0.5s",
        }}
      >
        <TitleBar title={title} right={right} onClose={onClose} />
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
      {overlay}
    </div>
  );
});
