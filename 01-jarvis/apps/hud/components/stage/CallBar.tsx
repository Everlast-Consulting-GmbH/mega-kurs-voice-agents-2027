"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { fmtDuration, useNow } from "@/lib/hooks";
import { loadVoiceSession, useVoiceSession } from "@/lib/voice";

const PILL = "flex h-[57px] items-center gap-3 rounded-full px-[27px] text-[20px] text-[#dfe2ff]";
// Same dark glass and ice hairline as the control deck; red only marks the end of a live call.
const GLASS = { background: "rgba(4,9,14,0.82)", border: "1px solid rgba(169,200,216,0.2)" } as const;
const END = { background: "linear-gradient(180deg, rgba(239,68,68,0.34), rgba(185,28,28,0.28))", border: "1px solid rgba(248,113,113,0.7)", color: "#ffe4e4", boxShadow: "0 0 24px rgba(239,68,68,0.25)" } as const;

function useConnectedSince(state: string) {
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => {
    setSince(state === "connected" ? Date.now() : null);
  }, [state]);
  return since;
}

/** Bottom centre, always: call time, microphone, end (or start) the call. */
export function CallBar() {
  const v = useVoiceSession();
  const now = useNow(1000);
  const since = useConnectedSince(v.state);
  const connected = v.state === "connected";
  const dot = connected ? "#eef0ff" : v.state === "connecting" ? "#fbbf24" : v.state === "error" ? "#f87171" : "rgba(255,255,255,0.35)";
  // Sessions report their own errors; never start a second connect.
  const toggle = async () => {
    const s = await loadVoiceSession();
    if (s.state === "connecting") return;
    if (s.state === "connected") await s.disconnect();
    else await s.connect();
  };

  return (
    <motion.div
      data-testid="call-bar"
      className="absolute flex items-center gap-[15px]"
      style={{ left: "50%", bottom: 46, x: "-50%" }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={PILL} style={GLASS}>
        <span className="h-[14px] w-[14px] rounded-full" style={{ background: dot }} />
        <span className="tabular-nums" data-testid="call-duration">
          {v.state === "error" ? "Keine Verbindung" : since ? fmtDuration(now - since) : "00:00"}
        </span>
      </div>
      <button type="button" title={v.muted ? "Mikrofon an" : "Mikrofon aus"} aria-label={v.muted ? "Mikrofon an" : "Mikrofon aus"} onClick={() => v.mute(!v.muted)} className={`${PILL} justify-center`} style={GLASS}>
        <MicIcon off={v.muted} />
      </button>
      <button
        type="button"
        data-testid="call-toggle"
        onClick={() => void toggle().catch(() => {})}
        disabled={v.state === "connecting"}
        className={PILL}
        style={connected ? END : GLASS}
      >
        {connected ? "Beenden" : v.state === "connecting" ? "Verbinde …" : "Anrufen"}
      </button>
    </motion.div>
  );
}

const MicIcon = ({ off }: { off: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);
