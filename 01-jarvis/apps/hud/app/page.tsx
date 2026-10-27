"use client";
import dynamic from "next/dynamic";

// The HUD is a pure client app (WebSocket, WebGL, Web Audio); no server rendering.
const HudApp = dynamic(() => import("@/components/HudApp"), { ssr: false });

export default function Page() {
  return <HudApp />;
}
