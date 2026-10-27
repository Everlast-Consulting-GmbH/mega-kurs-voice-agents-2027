"use client";
import { useRef } from "react";
import { usePlaybackNow } from "@/lib/apps/usePlayback";
import { happened, playhead, type Played } from "@/lib/agents";
import { AgentCursor } from "./AgentCursor";
import type { AgentLook } from "./MailApp";
import { WindowShell } from "./WindowShell";

/** An app without its own window design (PraxisPilot as a run agent): the agent's steps as a log. */
export function GenericApp({ played, agent }: { played: Played[]; agent?: AgentLook }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const now = usePlaybackNow(played);
  const { current } = playhead(played, now);
  const done = happened(played, now);
  return (
    <WindowShell ref={rootRef} testId="app-generic" title="PraxisPilot" overlay={agent && <AgentCursor rootRef={rootRef} target={current ? `gen:${current.seq}` : null} color={agent.color} label={agent.label} done={agent.done} />}>
      <div className="flex h-full flex-col gap-[8px] p-[18px] text-[15px]" style={{ background: "#f1f5f9" }}>
        {done.slice(-6).map((p) => (
          <div key={p.seq} data-t={`gen:${p.seq}`} data-tx="0.8" className="rounded-[8px] bg-white px-[12px] py-[8px] text-[#0f172a] shadow-sm">
            {p.caption}
          </div>
        ))}
      </div>
    </WindowShell>
  );
}
