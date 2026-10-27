"use client";
import { useEffect, useRef, useState } from "react";
import type { Email } from "@jarvis/contracts";
import { AnimatePresence, motion } from "motion/react";
import { useAppData } from "@/lib/apps/data";
import { DEMO_USER } from "@/lib/apps/fixtures";
import { canSend, DEMO_ACCOUNT, mailLists, unreadCount, useMailDemo, type Compose, type ComposeField, type SentMail } from "@/lib/apps/mailDemo";
import { usePlaybackNow } from "@/lib/apps/usePlayback";
import { useNow } from "@/lib/hooks";
import { ago, avatarColor, initials, mailTime, mailView } from "@/lib/apps/views";
import { playhead, type Played } from "@/lib/agents";
import { AgentCursor } from "./AgentCursor";
import { WindowShell } from "./WindowShell";
import { Calendar as CalendarIcon, Check, File, Inbox, Paperclip, Pencil, Reply, Search, Send, Star } from "./icons";

const ACCENT = "#6c5ce7";
export type AgentLook = { color: string; label: string; done: boolean };

export function Caret({ color, on = true }: { color: string; on?: boolean }) {
  if (!on) return null;
  return <span className="caret-blink ml-[1px] inline-block h-[1.05em] w-[2px] translate-y-[0.18em] rounded-full" style={{ background: color }} />;
}

type MailAppProps = { played: Played[]; agent?: AgentLook; interactive?: boolean; onClose?: () => void };

/**
 * Mail client in the style of a modern web mailer: folders, list, reading pane, reply.
 * Agent playback by default; `interactive` turns it into a clickable demo mailer as long as
 * no agent is playing in it (agent runs always win, so the choreography stays intact).
 */
export function MailApp({ played, agent, interactive = false, onClose }: MailAppProps) {
  if (interactive && !agent && played.length === 0) return <InteractiveMail onClose={onClose} />;
  return <AgentMail played={played} agent={agent} onClose={onClose} />;
}

function AgentMail({ played, agent, onClose }: { played: Played[]; agent?: AgentLook; onClose?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const now = usePlaybackNow(played);
  const emails = useAppData((s) => s.emails);
  const view = mailView(emails, played, now);
  const draft = view.draft ?? { text: "", shown: "", active: true, sent: false, sentAt: null };
  const inbox = emails.filter((e) => e.folder === "inbox").sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const unread = inbox.filter((e) => e.unread && !view.replied.includes(e.id)).length;
  const sel = emails.find((e) => e.id === view.selectedId) ?? inbox[0];
  const { current } = playhead(played, now);
  const composing = played.some((p) => p.action === "type" && p.start <= now);
  const send = draft.sent ? played.find((p) => p.action === "send" && p.hit === draft.sentAt) : undefined;
  const sentDone = !!send && now >= send.end;
  const target = !current ? null : { open: "mail:inbox", select: `mail:row-${current.entityId}`, type: "mail:draft", send: "mail:send", create: "mail:list", move: "mail:list" }[current.action];
  const clicked = current && now >= current.hit && current.action !== "type" ? current.seq : null;
  const user = DEMO_USER;

  return (
    <WindowShell
      ref={rootRef}
      testId="app-mail"
      app="mail"
      title="Mail – Posteingang"
      onClose={onClose}
      overlay={agent && <AgentCursor rootRef={rootRef} target={target} color={agent.color} label={agent.label} click={clicked} version={`${composing}-${sentDone}`} done={agent.done} />}
    >
      <div className="flex h-full text-[14px]">
        {/* folders */}
        <div className="flex w-[176px] shrink-0 flex-col gap-[3px] px-[10px] pt-[14px]" style={{ background: "#f6f6fa", color: "#4b4b58" }}>
          <div className="mb-[10px] flex items-center gap-[9px] rounded-[12px] px-[13px] py-[9px] text-[14.5px] font-medium" style={{ background: "#e9e6ff", color: "#3b2fb8" }}>
            <Pencil size={17} /> Schreiben
          </div>
          <Folder icon={<Inbox size={17} />} label="Posteingang" count={unread} on t="mail:inbox" />
          <Folder icon={<Star size={17} />} label="Markiert" />
          <Folder icon={<Send size={16} />} label="Gesendet" count={view.draft?.sent ? 1 : undefined} subtle />
          <Folder icon={<File size={16} />} label="Entwürfe" count={composing && !view.draft?.sent ? 1 : undefined} subtle />
          <div className="mb-[4px] mt-[14px] px-[10px] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9a9aa8]">Labels</div>
          <Label color="#a855f7" text="Kunden" />
          <Label color="#f59e0b" text="Team" />
          <Label color="#14b8a6" text="Rechnungen" />
        </div>

        {/* list */}
        <div className="flex w-[256px] shrink-0 flex-col border-r border-[#ececf2]" data-t="mail:list">
          <div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-[#ececf2] px-[14px] text-[#8a8a98]">
            <Search size={16} />
            <span className="text-[13.5px]">In E-Mails suchen</span>
          </div>
          {inbox.slice(0, 6).map((m) => {
            const on = m.id === sel?.id;
            const replied = view.replied.includes(m.id);
            const bold = m.unread && !replied;
            return (
              <div
                key={m.id}
                data-t={`mail:row-${m.id}`}
                data-tx="0.4"
                className="relative border-b border-[#f0f0f5] px-[14px] py-[9px]"
                style={{ background: on ? "#f0eeff" : "#fff", transition: "background 0.3s" }}
              >
                {on && <span className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: ACCENT }} />}
                <div className="flex items-center gap-[7px]">
                  {bold && <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: ACCENT }} />}
                  <span className={`truncate text-[14.5px] ${bold ? "font-semibold text-[#14141c]" : "text-[#3c3c48]"}`}>{m.fromName}</span>
                  {replied && <Reply size={14} className="shrink-0 text-[#8a8a98]" />}
                  <span className={`ml-auto shrink-0 text-[12.5px] ${bold ? "font-semibold text-[#3b2fb8]" : "text-[#9a9aa8]"}`}>{mailTime(m.receivedAt, new Date(now))}</span>
                </div>
                <div className={`mt-[2px] truncate text-[13.5px] ${bold ? "font-medium text-[#22222c]" : "text-[#55556a]"}`}>{m.subject}</div>
                <div className="truncate text-[12.5px] text-[#9696a6]">{m.body.replace(/\s+/g, " ").replace(/^Hallo [^,]+,\s*/, "")}</div>
              </div>
            );
          })}
        </div>

        {/* reading pane */}
        {sel && (
          <div className="relative flex min-w-0 flex-1 flex-col px-[22px] pt-[16px]">
            <div className="flex items-start gap-3">
              <h3 className="m-0 min-w-0 flex-1 text-[20px] font-semibold leading-tight text-[#14141c]">{sel.subject}</h3>
              {sel.priority === "high" && <span className="mt-[2px] shrink-0 rounded-[6px] bg-[#fff1ea] px-[7px] py-[2px] text-[12px] font-semibold text-[#c2551b]">Wichtig</span>}
            </div>
            <div className="mt-[12px] flex items-center gap-[10px]">
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white" style={{ background: avatarColor(sel.fromName) }}>
                {initials(sel.fromName)}
              </span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[14.5px] font-semibold text-[#22222c]">{sel.fromName.split(" · ")[0]}</div>
                <div className="truncate text-[12.5px] text-[#8a8a98]">{sel.from}</div>
              </div>
              <span className="ml-auto shrink-0 text-[12.5px] text-[#8a8a98]">{ago(sel.receivedAt, now)}</span>
            </div>
            <div className="mt-[10px] whitespace-pre-line text-[14.5px] leading-[1.5] text-[#33333f]" style={{ display: "-webkit-box", WebkitLineClamp: composing ? 3 : 9, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {sel.body}
            </div>

            <AnimatePresence>
              {composing && !sentDone && (
                <motion.div
                  key="draft"
                  data-testid="mail-draft"
                  data-sent={draft.sent || undefined}
                  className="absolute bottom-[14px] left-[16px] right-[16px] rounded-[12px] bg-white"
                  style={{ border: `1.5px solid ${draft.sent ? "#86efac" : "#d9d5ff"}`, boxShadow: "0 10px 28px rgba(108,92,231,0.16)" }}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex items-center gap-2 border-b border-[#f0eef9] px-[14px] py-[7px] text-[12.5px] text-[#8a8a98]">
                    <Reply size={14} /> an <b className="font-semibold text-[#3c3c48]">{sel.fromName.split(" · ")[0]}</b>
                    {agent && draft.active && (
                      <span className="ml-auto text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: agent.color }}>
                        Jarvis schreibt
                      </span>
                    )}
                  </div>
                  <div className="min-h-[66px] whitespace-pre-line px-[14px] py-[9px] text-[16px] leading-[1.45] text-[#1f1f2a]" data-t="mail:draft" data-tx="0.94" data-ty="0.12">
                    {draft.shown}
                    <Caret color={ACCENT} on={!draft.sent} />
                  </div>
                  <div className="flex items-center gap-3 px-[12px] pb-[10px] text-[#9a9aa8]">
                    <motion.span
                      data-t="mail:send"
                      className="flex items-center gap-[7px] rounded-full px-[16px] py-[7px] text-[14px] font-semibold text-white"
                      animate={{ background: draft.sent ? "#16a34a" : ACCENT, scale: current?.action === "send" && now >= current.hit && now < current.hit + 200 ? 0.94 : 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      {draft.sent ? <Check size={15} /> : <Send size={15} />}
                      {draft.sent ? "Gesendet" : "Senden"}
                    </motion.span>
                    <Paperclip size={17} />
                    <span className="ml-auto text-[12px]">Entwurf gespeichert</span>
                  </div>
                </motion.div>
              )}
              {sentDone && (
                <motion.div
                  key="sent"
                  className="absolute bottom-[14px] left-[16px] right-[16px] rounded-[12px] px-[14px] py-[10px]"
                  style={{ background: "#f5f4ff", border: "1px solid #e6e3fb" }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="mb-[4px] flex items-center gap-2 text-[12.5px] text-[#6b6b7b]">
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#16a34a] text-white">
                      <Check size={12} />
                    </span>
                    <b className="font-semibold text-[#2b2b36]">{user}</b> · gerade eben · gesendet von Jarvis
                  </div>
                  <div className="line-clamp-2 text-[14px] leading-snug text-[#3c3c48]">{draft.text}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </WindowShell>
  );
}

function Folder({ icon, label, count, on, subtle, t, onClick, testId, folderRef }: { icon: React.ReactNode; label: string; count?: number; on?: boolean; subtle?: boolean; t?: string; onClick?: () => void; testId?: string; folderRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={folderRef}
      data-t={t}
      data-testid={testId}
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex items-center gap-[10px] rounded-full px-[12px] py-[6px] text-[14px] ${onClick ? "cursor-pointer transition-colors hover:bg-[#ecebf6]" : ""}`}
      style={on ? { background: "#e4e1fb", color: "#2d2394", fontWeight: 600 } : undefined}
    >
      {icon}
      <span className="truncate">{label}</span>
      {!!count && (
        <motion.span
          key={count}
          initial={onClick ? { scale: 1.7 } : false}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 18 }}
          className={`ml-auto text-[12.5px] ${subtle ? "text-[#9a9aa8]" : "font-semibold"}`}
        >
          {count}
        </motion.span>
      )}
    </div>
  );
}

function Label({ color, text }: { color: string; text: string }) {
  return (
    <div className="flex items-center gap-[10px] px-[12px] py-[4px] text-[13.5px]">
      <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />
      {text}
    </div>
  );
}

// ---- interactive demo mailer ---------------------------------------------------------------

const TYPE_MS = 22;
const TYPE_CHARS = 3;
const TOAST_MS = 3400;
const EASE = [0.16, 1, 0.3, 1] as const;

type Flash = { seq: number; toName: string; plane: { x: number; y: number; dx: number; dy: number } | null };

// HUD shortcuts listen on window (R = reset, D, T ...) and only skip <input>; keep keys typed
// into the mailer (textarea included) from reaching them.
const keepKeys = (e: React.KeyboardEvent) => e.stopPropagation();

function InteractiveMail({ onClose }: { onClose?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sentFolderRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const now = useNow(30_000);
  const emails = useAppData((s) => s.emails);
  const folder = useMailDemo((s) => s.folder);
  const selectedId = useMailDemo((s) => s.selectedId);
  const compose = useMailDemo((s) => s.compose);
  const sent = useMailDemo((s) => s.sent);
  const read = useMailDemo((s) => s.read);
  const query = useMailDemo((s) => s.query);
  const stashed = useMailDemo((s) => s.stash.length);
  const actions = useMailDemo((s) => s.actions);
  const [flash, setFlash] = useState<Flash | null>(null);

  // the AI draft types itself; any edit, selection, send or discard ends it
  const typing = !!compose?.ai;
  useEffect(() => {
    if (!typing) return;
    const id = setInterval(() => actions.tick(TYPE_CHARS), TYPE_MS);
    return () => clearInterval(id);
  }, [typing, actions]);
  // closing the window stops typing for good and drops a pending toast
  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
      useMailDemo.getState().actions.stopTyping();
    },
    [],
  );

  const { sentRows, inboxShown, sentShown, selInbox, selSent } = mailLists({ folder, selectedId, sent, query }, emails);
  const q = query.trim();
  const replied = new Set(sent.map((m) => m.inReplyTo));
  const unread = unreadCount({ read, sent }, emails);
  const replyEmail = compose?.replyTo ? (emails.find((e) => e.id === compose.replyTo) ?? null) : null;

  function send() {
    const root = rootRef.current?.getBoundingClientRect();
    const from = sendRef.current?.getBoundingClientRect();
    const to = sentFolderRef.current?.getBoundingClientRect();
    const toName = compose?.toName || compose?.to.trim() || "";
    if (!actions.send()) return;
    const plane =
      root && from && to
        ? (() => {
            const x = from.left - root.left + from.width / 2;
            const y = from.top - root.top + from.height / 2;
            return { x, y, dx: to.left - root.left + 28 - x, dy: to.top - root.top + to.height / 2 - y };
          })()
        : null;
    clearTimeout(flashTimer.current);
    setFlash({ seq: (flash?.seq ?? 0) + 1, toName, plane });
    flashTimer.current = setTimeout(() => setFlash(null), TOAST_MS);
  }

  function replyWithJarvis(email: Email) {
    actions.reply(email);
    actions.aiDraft(email);
  }

  const overlay = (
    <>
      <AnimatePresence>
        {flash?.plane && (
          <motion.span
            key={`plane-${flash.seq}`}
            className="pointer-events-none absolute z-30 flex h-[34px] w-[34px] items-center justify-center rounded-full text-white"
            style={{ left: flash.plane.x - 17, top: flash.plane.y - 17, background: ACCENT, boxShadow: "0 8px 24px rgba(108,92,231,0.45)" }}
            initial={{ x: 0, y: 0, scale: 0.6, opacity: 0, rotate: 0 }}
            animate={{
              x: [0, flash.plane.dx * 0.35, flash.plane.dx],
              y: [0, flash.plane.dy * 0.35 - 70, flash.plane.dy],
              scale: [0.6, 1.15, 0.45],
              opacity: [0, 1, 0],
              rotate: [0, -18, -40],
            }}
            transition={{ duration: 0.95, ease: "easeInOut", times: [0, 0.4, 1] }}
            onAnimationComplete={() => setFlash((f) => (f ? { ...f, plane: null } : f))}
          >
            <Send size={17} />
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {flash && (
          <motion.div
            key={`toast-${flash.seq}`}
            data-testid="mail-sent-confirmation"
            role="status"
            className="pointer-events-none absolute bottom-[22px] left-1/2 z-30 flex items-center gap-[10px] rounded-full py-[9px] pl-[10px] pr-[18px] text-[14px] text-white"
            style={{ background: "#1f1d2e", boxShadow: "0 14px 34px rgba(20,16,50,0.35)" }}
            initial={{ opacity: 0, y: 20, x: "-50%", scale: 0.92 }}
            animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
            exit={{ opacity: 0, y: 12, x: "-50%", scale: 0.96 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <motion.span
              className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#16a34a]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 16, delay: 0.15 }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.3 }} />
              </svg>
            </motion.span>
            <span>
              Gesendet an <b className="font-semibold">{flash.toName}</b>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <WindowShell ref={rootRef} testId="app-mail" app="mail" title={folder === "sent" ? "Mail – Gesendet" : "Mail – Posteingang"} onClose={onClose} overlay={overlay}>
      <div className="flex h-full text-[14px]" data-testid="mail-interactive">
        {/* folders */}
        <div className="flex w-[176px] shrink-0 flex-col gap-[3px] px-[10px] pt-[14px]" style={{ background: "#f6f6fa", color: "#4b4b58" }}>
          <motion.button
            type="button"
            data-testid="mail-new"
            onClick={() => actions.compose()}
            whileHover={{ y: -1, boxShadow: "0 6px 16px rgba(108,92,231,0.18)" }}
            whileTap={{ scale: 0.97 }}
            className="mb-[10px] flex cursor-pointer items-center gap-[9px] rounded-[12px] px-[13px] py-[9px] text-left text-[14.5px] font-medium"
            style={{ background: "#e9e6ff", color: "#3b2fb8" }}
          >
            <Pencil size={17} /> Schreiben
          </motion.button>
          <Folder icon={<Inbox size={17} />} label="Posteingang" count={unread} on={folder === "inbox"} testId="mail-folder-inbox" onClick={() => actions.open("inbox")} />
          <Folder icon={<Star size={17} />} label="Markiert" />
          <Folder
            icon={<Send size={16} />}
            label="Gesendet"
            count={sentRows.length || undefined}
            on={folder === "sent"}
            subtle
            testId="mail-folder-sent"
            folderRef={sentFolderRef}
            onClick={() => actions.open("sent")}
          />
          <Folder icon={<File size={16} />} label="Entwürfe" count={(compose ? 1 : 0) + stashed || undefined} subtle testId="mail-folder-drafts" onClick={!compose && stashed ? actions.discard : undefined} />
          <div className="mb-[4px] mt-[14px] px-[10px] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9a9aa8]">Labels</div>
          <Label color="#a855f7" text="Kunden" />
          <Label color="#f59e0b" text="Team" />
          <Label color="#14b8a6" text="Rechnungen" />
          {/* account */}
          <div className="mb-[12px] mt-auto flex items-center gap-[8px] rounded-[12px] px-[8px] py-[7px]" data-testid="mail-account" style={{ background: "#efeef6" }}>
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold text-white" style={{ background: ACCENT }}>
              {initials(DEMO_USER)}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[12.5px] font-semibold text-[#2b2b36]">{DEMO_USER}</div>
              <div className="truncate text-[11px] text-[#8a8a98]">{DEMO_ACCOUNT}</div>
            </div>
          </div>
        </div>

        {/* list */}
        <div className="flex w-[256px] shrink-0 flex-col border-r border-[#ececf2]">
          <label className="flex h-[44px] shrink-0 items-center gap-2 border-b border-[#ececf2] px-[14px] text-[#8a8a98]">
            <Search size={16} />
            <input
              data-testid="mail-search"
              value={query}
              onChange={(e) => actions.search(e.target.value)}
              onKeyDown={keepKeys}
              placeholder="In E-Mails suchen"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#2b2b36] outline-none placeholder:text-[#8a8a98]"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {folder === "inbox" &&
              inboxShown.map((m) => {
                const on = m.id === selInbox?.id;
                const bold = m.unread && !read.includes(m.id) && !replied.has(m.id);
                return (
                  <MailRow
                    key={m.id}
                    testId={`mail-row-${m.id}`}
                    on={on}
                    bold={bold}
                    name={m.fromName}
                    time={mailTime(m.receivedAt, new Date(now))}
                    subject={m.subject}
                    preview={m.body.replace(/\s+/g, " ").replace(/^Hallo [^,]+,\s*/, "")}
                    replied={replied.has(m.id)}
                    onClick={() => actions.select(m.id)}
                  />
                );
              })}
            {folder === "sent" && (
              <AnimatePresence initial={false}>
                {sentShown.map((m) => (
                  <motion.div key={m.id} layout initial={{ opacity: 0, y: -14, backgroundColor: "#ecfdf3" }} animate={{ opacity: 1, y: 0, backgroundColor: "#ffffff" }} transition={{ duration: 0.6, ease: EASE }}>
                    <MailRow
                      testId={`mail-sent-row-${m.id}`}
                      on={m.id === selSent?.id}
                      name={`An: ${m.toName}`}
                      time={mailTime(m.sentAt, new Date(now))}
                      subject={m.subject}
                      preview={m.body.replace(/\s+/g, " ").replace(/^Hallo [^,]+,\s*/, "")}
                      onClick={() => actions.select(m.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            {((folder === "inbox" && inboxShown.length === 0) || (folder === "sent" && sentShown.length === 0)) && (
              <div className="px-[18px] py-[28px] text-center text-[13.5px] text-[#9a9aa8]">{q ? "Keine Treffer" : folder === "sent" ? "Noch nichts gesendet" : "Posteingang leer"}</div>
            )}
          </div>
        </div>

        {/* reading pane + compose */}
        <div className="relative flex min-w-0 flex-1 flex-col px-[22px] pb-[14px] pt-[16px]" data-testid="mail-reading">
          {!(compose?.mode === "new") && selInbox && folder === "inbox" && (
            <InboxMessage
              email={selInbox}
              now={now}
              compact={!!compose}
              replies={sent.filter((m) => m.inReplyTo === selInbox.id)}
              onReply={compose ? undefined : () => actions.reply(selInbox)}
              onReplyAi={compose ? undefined : () => replyWithJarvis(selInbox)}
            />
          )}
          {!(compose?.mode === "new") && selSent && folder === "sent" && !compose && <SentMessage mail={selSent} now={now} />}
          {!compose && !selInbox && !selSent && (
            <div className="m-auto flex flex-col items-center gap-2 text-[#9a9aa8]">
              <Inbox size={34} />
              <span className="text-[14px]">Keine E-Mail ausgewählt</span>
            </div>
          )}
          <AnimatePresence mode="popLayout">
            {compose && (
              <ComposePanel
                key="compose"
                compose={compose}
                replyEmail={replyEmail}
                sendRef={sendRef}
                onEdit={actions.edit}
                onInvite={actions.toggleInvite}
                onDiscard={actions.discard}
                onSend={send}
                onAi={() => actions.aiDraft(replyEmail)}
                onStop={actions.stopTyping}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </WindowShell>
  );
}

function MailRow({ testId, on, bold, name, time, subject, preview, replied, onClick }: { testId: string; on: boolean; bold?: boolean; name: string; time: string; subject: string; preview: string; replied?: boolean; onClick: () => void }) {
  return (
    <div
      data-testid={testId}
      role="button"
      onClick={onClick}
      className="relative cursor-pointer border-b border-[#f0f0f5] px-[14px] py-[9px] hover:bg-[#f8f7ff]"
      style={{ background: on ? "#f0eeff" : undefined, transition: "background 0.3s" }}
    >
      {on && <motion.span layoutId="mail-row-marker" className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: ACCENT }} />}
      <div className="flex items-center gap-[7px]">
        {bold && <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: ACCENT }} />}
        <span className={`truncate text-[14.5px] ${bold ? "font-semibold text-[#14141c]" : "text-[#3c3c48]"}`}>{name}</span>
        {replied && <Reply size={14} className="shrink-0 text-[#8a8a98]" />}
        <span className={`ml-auto shrink-0 text-[12.5px] ${bold ? "font-semibold text-[#3b2fb8]" : "text-[#9a9aa8]"}`}>{time}</span>
      </div>
      <div className={`mt-[2px] truncate text-[13.5px] ${bold ? "font-medium text-[#22222c]" : "text-[#55556a]"}`}>{subject}</div>
      <div className="truncate text-[12.5px] text-[#9696a6]">{preview}</div>
    </div>
  );
}

function Sender({ name, addr, when }: { name: string; addr: string; when: string }) {
  return (
    <div className="mt-[12px] flex items-center gap-[10px]">
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white" style={{ background: avatarColor(name) }}>
        {initials(name)}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[14.5px] font-semibold text-[#22222c]">{name}</div>
        <div className="truncate text-[12.5px] text-[#8a8a98]">{addr}</div>
      </div>
      <span className="ml-auto shrink-0 text-[12.5px] text-[#8a8a98]">{when}</span>
    </div>
  );
}

function InboxMessage({ email, now, compact, replies, onReply, onReplyAi }: { email: Email; now: number; compact: boolean; replies: SentMail[]; onReply?: () => void; onReplyAi?: () => void }) {
  return (
    <motion.div key={email.id} className="flex min-h-0 shrink flex-col" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: EASE }}>
      <div className="flex items-start gap-3">
        <h3 className="m-0 min-w-0 flex-1 text-[20px] font-semibold leading-tight text-[#14141c]">{email.subject}</h3>
        {email.priority === "high" && <span className="mt-[2px] shrink-0 rounded-[6px] bg-[#fff1ea] px-[7px] py-[2px] text-[12px] font-semibold text-[#c2551b]">Wichtig</span>}
      </div>
      <Sender name={email.fromName.split(" · ")[0]!} addr={email.from} when={ago(email.receivedAt, now)} />
      <div className="mt-[10px] min-h-0 overflow-y-auto whitespace-pre-line text-[14.5px] leading-[1.5] text-[#33333f]" style={compact ? { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>
        {email.body}
      </div>
      {!compact &&
        replies.map((r) => (
          <motion.div
            key={r.id}
            data-testid={`mail-thread-reply-${r.id}`}
            className="mt-[12px] rounded-[12px] px-[14px] py-[10px]"
            style={{ background: "#f5f4ff", border: "1px solid #e6e3fb" }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <div className="mb-[4px] flex items-center gap-2 text-[12.5px] text-[#6b6b7b]">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#16a34a] text-white">
                <Check size={12} />
              </span>
              <b className="font-semibold text-[#2b2b36]">{DEMO_USER}</b> · {ago(r.sentAt, now)} · gesendet
            </div>
            <div className="line-clamp-2 text-[14px] leading-snug text-[#3c3c48]">{r.body}</div>
          </motion.div>
        ))}
      {onReply && (
        <div className="mt-[16px] flex shrink-0 items-center gap-[10px]">
          <button type="button" data-testid="mail-reply" onClick={onReply} className="flex cursor-pointer items-center gap-[7px] rounded-full border border-[#dcdae8] bg-white px-[15px] py-[7px] text-[14px] font-medium text-[#3c3c48] transition-colors hover:bg-[#f6f6fa]">
            <Reply size={15} /> Antworten
          </button>
          <motion.button
            type="button"
            data-testid="mail-reply-ai"
            onClick={onReplyAi}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="flex cursor-pointer items-center gap-[7px] rounded-full px-[15px] py-[7px] text-[14px] font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #a855f7)`, boxShadow: "0 6px 18px rgba(108,92,231,0.3)" }}
          >
            <Spark size={15} /> Mit Jarvis antworten
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}

function SentMessage({ mail, now }: { mail: SentMail; now: number }) {
  return (
    <motion.div key={mail.id} data-testid="mail-sent-view" className="flex min-h-0 flex-col" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: EASE }}>
      <div className="flex items-start gap-3">
        <h3 className="m-0 min-w-0 flex-1 text-[20px] font-semibold leading-tight text-[#14141c]">{mail.subject}</h3>
        <span className="mt-[2px] flex shrink-0 items-center gap-[5px] rounded-[6px] bg-[#ecfdf3] px-[7px] py-[2px] text-[12px] font-semibold text-[#15803d]">
          <Check size={12} /> Gesendet
        </span>
      </div>
      <Sender name={DEMO_USER} addr={`an ${mail.toName} <${mail.to}>`} when={ago(mail.sentAt, now)} />
      <div className="mt-[10px] min-h-0 overflow-y-auto whitespace-pre-line text-[14.5px] leading-[1.5] text-[#33333f]">{mail.body}</div>
      {mail.invite && <InviteCard />}
    </motion.div>
  );
}

function InviteCard({ onRemove }: { onRemove?: () => void }) {
  return (
    <motion.div
      data-testid="mail-invite-card"
      className="mt-[10px] flex shrink-0 items-center gap-[10px] self-start rounded-[10px] border border-[#e6e3fb] bg-[#faf9ff] py-[7px] pl-[9px] pr-[12px]"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-white" style={{ background: ACCENT }}>
        <CalendarIcon size={16} />
      </span>
      <div className="leading-tight">
        <div className="text-[13px] font-semibold text-[#2b2b36]">Einladung · Videocall</div>
        <div className="text-[11.5px] text-[#8a8a98]">Kalendereinladung (.ics) im Anhang</div>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-[6px] cursor-pointer text-[16px] leading-none text-[#9a9aa8] hover:text-[#3c3c48]" aria-label="Einladung entfernen">
          ×
        </button>
      )}
    </motion.div>
  );
}

type ComposeProps = {
  compose: Compose;
  replyEmail: Email | null;
  sendRef: React.Ref<HTMLButtonElement>;
  onEdit: (field: ComposeField, value: string) => void;
  onInvite: () => void;
  onDiscard: () => void;
  onSend: () => void;
  onAi: () => void;
  onStop: () => void;
};

function ComposePanel({ compose, replyEmail, sendRef, onEdit, onInvite, onDiscard, onSend, onAi, onStop }: ComposeProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const ready = canSend(compose);
  const typing = !!compose.ai;
  // keep the newest typed line in view while Jarvis writes
  useEffect(() => {
    if (typing && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [typing, compose.body]);

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSend();
    } else if (e.key === "Escape" && typing) onStop();
  };

  const field = "min-w-0 flex-1 bg-transparent text-[14px] text-[#1f1f2a] outline-none placeholder:text-[#a6a6b4]";
  return (
    <motion.div
      data-testid="mail-compose"
      data-mode={compose.mode}
      data-typing={typing || undefined}
      onKeyDown={onKey}
      className={`flex min-h-[220px] flex-col rounded-[12px] bg-white ${compose.mode === "new" ? "flex-1" : "mt-[14px] flex-1"}`}
      style={{ border: `1.5px solid ${typing ? "#b9b0ff" : "#d9d5ff"}`, boxShadow: typing ? "0 10px 32px rgba(108,92,231,0.26)" : "0 10px 28px rgba(108,92,231,0.16)", transition: "border-color 0.3s, box-shadow 0.3s" }}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.96, transition: { duration: 0.32, ease: [0.55, 0, 0.75, 0.2] } }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <div className="flex items-center gap-2 border-b border-[#f0eef9] px-[14px] py-[7px] text-[12.5px] text-[#8a8a98]">
        {compose.mode === "reply" ? <Reply size={14} /> : <Pencil size={14} />}
        <span className="font-semibold text-[#3c3c48]">{compose.mode === "reply" ? "Antwort" : "Neue E-Mail"}</span>
        <AnimatePresence mode="wait" initial={false}>
          {typing ? (
            <motion.button
              key="stop"
              type="button"
              data-testid="mail-ai-stop"
              onClick={onStop}
              className="ml-auto flex cursor-pointer items-center gap-[7px] rounded-full px-[11px] py-[4px] text-[11.5px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: ACCENT, background: "#f0eeff" }}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
            >
              <span className="h-[7px] w-[7px] animate-pulse rounded-full" style={{ background: ACCENT }} />
              Jarvis schreibt · Stopp
            </motion.button>
          ) : (
            <motion.button
              key="ai"
              type="button"
              data-testid="mail-ai-draft"
              onClick={onAi}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              className="ml-auto flex cursor-pointer items-center gap-[6px] rounded-full px-[11px] py-[4px] text-[12.5px] font-semibold text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, #a855f7)` }}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
            >
              <Spark size={13} /> Entwurf mit Jarvis
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <label className="flex items-center gap-[10px] border-b border-[#f3f2f8] px-[14px] py-[7px]">
        <span className="w-[54px] shrink-0 text-[13px] text-[#8a8a98]">An</span>
        <input data-testid="mail-to" value={compose.to} onChange={(e) => onEdit("to", e.target.value)} placeholder="name@firma.example" className={field} autoFocus={compose.mode === "new"} />
      </label>
      <label className="flex items-center gap-[10px] border-b border-[#f3f2f8] px-[14px] py-[7px]">
        <span className="w-[54px] shrink-0 text-[13px] text-[#8a8a98]">Betreff</span>
        <input data-testid="mail-subject" value={compose.subject} onChange={(e) => onEdit("subject", e.target.value)} placeholder="Betreff" className={`${field} font-medium`} />
      </label>
      <textarea
        ref={bodyRef}
        data-testid="mail-body"
        value={compose.body}
        onChange={(e) => onEdit("body", e.target.value)}
        placeholder={replyEmail ? `Antwort an ${replyEmail.fromName.split(" · ")[0]} …` : "Nachricht …"}
        className="min-h-[70px] flex-1 resize-none bg-transparent px-[14px] py-[10px] text-[15.5px] leading-[1.45] text-[#1f1f2a] outline-none placeholder:text-[#a6a6b4]"
        autoFocus={compose.mode === "reply"}
      />
      <AnimatePresence>{compose.invite && <div className="px-[14px]"><InviteCard onRemove={onInvite} /></div>}</AnimatePresence>
      <div className="flex items-center gap-3 px-[12px] pb-[10px] pt-[8px] text-[#9a9aa8]">
        <motion.button
          ref={sendRef}
          type="button"
          data-testid="mail-send"
          disabled={!ready}
          onClick={onSend}
          whileHover={ready ? { y: -1, boxShadow: "0 8px 20px rgba(108,92,231,0.35)" } : undefined}
          whileTap={ready ? { scale: 0.94 } : undefined}
          className="flex items-center gap-[7px] rounded-full px-[16px] py-[7px] text-[14px] font-semibold text-white"
          style={{ background: ACCENT, opacity: ready ? 1 : 0.45, cursor: ready ? "pointer" : "default", transition: "opacity 0.2s" }}
        >
          <Send size={15} /> Senden
        </motion.button>
        <button type="button" data-testid="mail-invite" onClick={onInvite} title="Einladung anhängen" className="cursor-pointer rounded-[8px] p-[4px] hover:bg-[#f3f2f8]" style={{ color: compose.invite ? ACCENT : undefined }}>
          <CalendarIcon size={17} />
        </button>
        <Paperclip size={17} />
        <span className="ml-auto text-[12px]">{typing ? "Esc stoppt" : ready ? "⌘ ↵ zum Senden" : "Entwurf gespeichert"}</span>
        <button type="button" data-testid="mail-discard" onClick={onDiscard} className="cursor-pointer rounded-[8px] px-[8px] py-[3px] text-[12.5px] hover:bg-[#f3f2f8] hover:text-[#3c3c48]">
          Verwerfen
        </button>
      </div>
    </motion.div>
  );
}

const Spark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" />
  </svg>
);
