"use client";
import { useLayoutEffect, useState } from "react";
import { H, W } from "./stage/layout";

/** Fixed 1920x1080 design canvas, uniformly scaled and centered in the viewport. */
export function Stage({ children, backdrop }: { children: React.ReactNode; backdrop?: React.ReactNode }) {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ background: "#080a16" }}>
      {/* full-viewport layer behind the scaled canvas (also fills letterbox bars) */}
      {backdrop}
      <div data-testid="stage" className="relative shrink-0 overflow-hidden" style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "center" }}>
        {children}
      </div>
    </div>
  );
}
