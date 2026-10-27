"use client";
import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ChatMessage } from "@jarvis/contracts";
import { useAppData } from "@/lib/apps/data";
import { usePlaybackNow } from "@/lib/apps/usePlayback";
import { avatarColor, chatView, initials } from "@/lib/apps/views";
import { playhead, type Played } from "@/lib/agents";
import { AgentCursor } from "./AgentCursor";
import { Caret, type AgentLook } from "./MailApp";
import { WindowShell } from "./WindowShell";
import { At, Bold, Chevron, Paperclip, Plus, Send, Smile } from "./icons";

const SIDEBAR = "#3f0e40";
const MEMBERS: Record<string, number> = { allgemein: 4, vertrieb: 3, delivery: 3 };

const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/** Team chat in the style of Slack: workspace sidebar, channel history, composer. */
export function ChatApp({ played, agent, channel, onClose }: { played: Played[]; agent?: AgentLook; channel?: string; onClose?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const now = usePlaybackNow(played);
  const chat = useAppData((s) => s.chat);
  const view = { ...chatView(chat, played, now), ...(channel ? {channel} : {}) };
  const history = [...(chat[view.channel] ?? [])].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const { current } = playhead(played, now);
  const target = !current
    ? null
    : current.action === "open" || current.action === "select"
      ? `chat:channel-${(current.entityId ?? view.channel).replace(/^#/, "")}`
      : current.action === "type"
        ? "chat:compose"
        : current.action === "send"
          ? "chat:send"
          : "chat:history";
  const clicked = current && now >= current.hit && current.action !== "type" ? current.seq : null;
  const hasText = !!view.compose?.shown;

  return (
    <WindowShell
      ref={rootRef}
      onClose={onClose}
      testId="app-chat"
      app="chat"
      title={`Slack – #${view.channel}`}
      overlay={agent && <AgentCursor rootRef={rootRef} target={target} color={agent.color} label={agent.label} click={clicked} version={`${view.channel}-${view.sent.length}`} done={agent.done} />}
    >
      <div className="flex h-full text-[14px]">
        <div className="flex w-[160px] shrink-0 flex-col text-[14px]" style={{ background: SIDEBAR, color: "#cfc3d0" }}>
          <div className="flex h-[44px] shrink-0 items-center gap-1 border-b px-[13px] text-[15px] font-bold text-white" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
            Leos Agentur <Chevron size={14} />
          </div>
          <div className="px-[8px] pt-[10px]">
            <div className="mb-[3px] px-[7px] text-[12.5px] font-medium" style={{ color: "#bca9bd" }}>
              Kanäle
            </div>
            {Object.keys(MEMBERS).map((c) => {
              const on = c === view.channel;
              return (
                <div key={c} data-t={`chat:channel-${c}`} data-tx="0.35" className="truncate rounded-[6px] px-[8px] py-[3px]" style={on ? { background: "#1164a3", color: "#fff", fontWeight: 600 } : undefined}>
                  <span className="mr-[5px] opacity-70">#</span>
                  {c}
                </div>
              );
            })}
            <div className="mb-[3px] mt-[12px] px-[7px] text-[12.5px] font-medium" style={{ color: "#bca9bd" }}>
              Direktnachrichten
            </div>
            {["Mara", "Jonas"].map((n) => (
              <div key={n} className="flex items-center gap-[7px] px-[8px] py-[3px]">
                <span className="h-[8px] w-[8px] rounded-full bg-[#2bac76]" />
                {n}
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-[#ececf0] px-[16px]">
            <span className="text-[16px] font-bold text-[#1d1c1d]"># {view.channel}</span>
            <span className="text-[12.5px] text-[#8b8a8f]">{MEMBERS[view.channel] ?? 3} Mitglieder</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-[11px] overflow-hidden px-[16px] pb-[8px]" data-t="chat:history">
            {history.slice(-4).map((m) => (
              <Message key={m.id} m={m} />
            ))}
            <AnimatePresence>
              {view.sent.map((m) => (
                <motion.div key={m.id} data-testid="chat-sent" initial={{ opacity: 0, y: 14, background: "#fff7e0" }} animate={{ opacity: 1, y: 0, background: "rgba(255,247,224,0)" }} transition={{ duration: 0.45, background: { delay: 0.8, duration: 1.2 } }} className="-mx-[6px] rounded-[8px] px-[6px]">
                  <Message m={m} jarvis />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="mx-[14px] mb-[12px] shrink-0 rounded-[9px] border border-[#c9c8cc]">
            <div className="flex items-center gap-[11px] border-b border-[#efefef] px-[10px] py-[5px] text-[#9a999e]">
              <Bold size={15} />
              <span className="text-[14px] italic">I</span>
              <span className="text-[14px] line-through">S</span>
              <span className="text-[13px]">🔗</span>
            </div>
            <div className="min-h-[38px] px-[11px] py-[7px] text-[15px] leading-snug" data-t="chat:compose" data-tx="0.95" data-ty="0.1" style={{ color: hasText ? "#1d1c1d" : "#9a999e" }}>
              {view.compose ? (
                <>
                  {view.compose.shown}
                  <Caret color="#1d1c1d" on={view.compose.active || !hasText} />
                </>
              ) : (
                `Nachricht an #${view.channel}`
              )}
            </div>
            <div className="flex items-center gap-[11px] px-[10px] pb-[6px] text-[#8b8a8f]">
              <Plus size={17} />
              <Smile size={17} />
              <At size={17} />
              <Paperclip size={16} />
              <motion.span
                data-t="chat:send"
                className="ml-auto flex h-[28px] w-[34px] items-center justify-center rounded-[6px]"
                animate={{ background: hasText ? "#007a5a" : "#f0f0f0", color: hasText ? "#fff" : "#b0afb4" }}
                transition={{ duration: 0.25 }}
              >
                <Send size={15} />
              </motion.span>
            </div>
          </div>
        </div>
      </div>
    </WindowShell>
  );
}

function Message({ m, jarvis }: { m: ChatMessage; jarvis?: boolean }) {
  const isJarvis = jarvis || m.fromJarvis;
  return (
    <div className="flex gap-[10px]">
      <span
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] text-[13px] font-bold text-white"
        style={{ background: isJarvis ? "linear-gradient(135deg,#a5b4fc,#ffc9a3)" : avatarColor(m.author) }}
      >
        {isJarvis ? "J" : initials(m.author)}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-[7px]">
          <b className="text-[15px] font-bold text-[#1d1c1d]">{isJarvis ? "Jarvis" : m.author}</b>
          {isJarvis && <span className="rounded-[3px] bg-[#e8e8e8] px-[4px] text-[10.5px] font-semibold text-[#616061]">APP</span>}
          <span className="text-[12.5px] text-[#8b8a8f]">{jarvis ? "jetzt" : time(m.sentAt)}</span>
        </div>
        <p className="m-0 text-[15px] leading-[1.4] text-[#1d1c1d]">{m.text}</p>
      </div>
    </div>
  );
}
