"use client";
import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { CalendarEvent } from "@jarvis/contracts";
import { useAppData } from "@/lib/apps/data";
import { isoWeek, weekStart } from "@/lib/apps/fixtures";
import { usePlaybackNow } from "@/lib/apps/usePlayback";
import { calendarView, slotOf } from "@/lib/apps/views";
import { playhead, type Played } from "@/lib/agents";
import { AgentCursor } from "./AgentCursor";
import { Caret, type AgentLook } from "./MailApp";
import { WindowShell } from "./WindowShell";
import { Check, Chevron } from "./icons";

const FIRST_HOUR = 9;
const HOURS = 9; // 09:00 - 18:00
const GHOST = "#f97316";
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr"];

/** Event colour like a real calendar: tinted body, strong left bar. */
export function eventTone(e: Pick<CalendarEvent, "title" | "leadId">): { bar: string; bg: string; text: string } {
  const t = e.title.toLowerCase();
  if (/standup|team/.test(t)) return { bar: "#3b82f6", bg: "#e8f0fe", text: "#1e3a8a" };
  if (/review|planung/.test(t)) return { bar: "#f59e0b", bg: "#fef3c7", text: "#78350f" };
  if (/workshop/.test(t)) return { bar: "#14b8a6", bg: "#ddf6f2", text: "#134e4a" };
  if (/go-live/.test(t)) return { bar: "#22c55e", bg: "#e3f8ea", text: "#14532d" };
  return { bar: "#8b5cf6", bg: "#efe9ff", text: "#3b1f86" };
}

const hm = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const pct = (d: Date) => ((d.getHours() + d.getMinutes() / 60 - FIRST_HOUR) / HOURS) * 100;

/** Week view, Monday to Friday, 09-18 h; new events are typed into a quick-add popover. */
export function CalendarApp({ played, agent, onClose }: { played: Played[]; agent?: AgentLook; onClose?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const now = usePlaybackNow(played);
  const events = useAppData((s) => s.events);
  const today = new Date(now);
  const { ghost } = calendarView(events, played, now, today);
  const { current } = playhead(played, now);
  const pendingSel = [...played].reverse().find((p) => (p.action === "select" || p.action === "move") && p.start <= now);
  const slot = pendingSel ? slotOf(pendingSel, today) : null;
  const anchor = ghost?.start ?? slot ?? today;
  const mon = weekStart(anchor);
  const days = DAYS.map((_, i) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
  const month = mon.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const target = !current ? null : { open: "cal:today", select: "cal:slot", move: "cal:slot", type: "cal:title", create: "cal:save", send: "cal:save" }[current.action];
  const dayIndex = ghost ? days.findIndex((d) => sameDay(d, ghost.start)) : -1;
  const clicked = current && now >= current.hit && current.action !== "type" ? current.seq : null;
  const nowPct = pct(today);

  return (
    <WindowShell
      onClose={onClose}
      ref={rootRef}
      testId="app-calendar"
      app="calendar"
      title={`Kalender – Woche ${isoWeek(mon)}`}
      overlay={agent && <AgentCursor rootRef={rootRef} target={target} color={agent.color} label={agent.label} click={clicked} version={`${!!slot}-${ghost?.state}`} done={agent.done} />}
    >
      <div className="flex h-full flex-col text-[13px]">
        {/* toolbar */}
        <div className="flex h-[46px] shrink-0 items-center gap-[10px] border-b border-[#ececf2] px-[14px]">
          <span className="rounded-[8px] border border-[#dcdce6] px-[11px] py-[4px] text-[13.5px] font-medium text-[#33333f]">Heute</span>
          <span className="flex text-[#7a7a88]">
            <Chevron dir="left" size={18} />
            <Chevron dir="right" size={18} />
          </span>
          <span className="text-[16px] font-semibold capitalize text-[#1d1d27]">{month}</span>
          <span className="text-[13.5px] text-[#9a9aa8]">KW {isoWeek(mon)}</span>
          <span className="ml-auto flex overflow-hidden rounded-[8px] border border-[#dcdce6] text-[13px] text-[#55556a]">
            {["Tag", "Woche", "Monat"].map((v) => (
              <span key={v} className="px-[10px] py-[3px]" style={v === "Woche" ? { background: "#eceaf7", color: "#2b2b36", fontWeight: 600 } : undefined}>
                {v}
              </span>
            ))}
          </span>
        </div>
        {/* day header */}
        <div className="flex h-[42px] shrink-0 border-b border-[#ececf2]">
          <div className="w-[46px] shrink-0" />
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            return (
              <div key={i} data-t={isToday ? "cal:today" : undefined} className="flex flex-1 items-center justify-center gap-[6px] border-l border-[#f0f0f5] text-[13.5px]" style={{ color: isToday ? "#e5484d" : "#6b6b7b", fontWeight: isToday ? 600 : 500 }}>
                {DAYS[i]}
                <span className="flex h-[26px] min-w-[26px] items-center justify-center rounded-full px-[4px] text-[14px]" style={isToday ? { background: "#e5484d", color: "#fff" } : { color: "#2b2b36" }}>
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>
        {/* grid */}
        <div className="relative flex min-h-0 flex-1">
          <div className="relative w-[46px] shrink-0">
            {Array.from({ length: HOURS }, (_, h) => (
              <span key={h} className="absolute right-[7px] -translate-y-1/2 text-[11.5px] tabular-nums text-[#a0a0ae]" style={{ top: `${(h / HOURS) * 100}%` }}>
                {h ? `${String(FIRST_HOUR + h).padStart(2, "0")}:00` : ""}
              </span>
            ))}
          </div>
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            const dayEvents = events.filter((e) => sameDay(new Date(e.start), d));
            return (
              <div key={i} className="relative flex-1 border-l border-[#f0f0f5]" style={{ background: isToday ? "#fcfcff" : undefined }}>
                {Array.from({ length: HOURS }, (_, h) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-[#f1f1f6]" style={{ top: `${(h / HOURS) * 100}%` }} />
                ))}
                {dayEvents.map((e) => (
                  <EventBlock key={e.id} e={e} />
                ))}
                {slot && sameDay(slot, d) && <div data-t="cal:slot" data-tx="0.55" className="absolute left-[4px] right-[4px]" style={{ top: `${pct(slot)}%`, height: `${100 / HOURS}%` }} />}
                <AnimatePresence>
                  {ghost && sameDay(ghost.start, d) && (
                    <motion.div
                      key="ghost"
                      data-testid="calendar-ghost"
                      data-state={ghost.state}
                      data-t="cal:ghost"
                      data-tx="0.6"
                      data-ty="0.45"
                      className="absolute left-[3px] right-[3px] overflow-hidden rounded-[7px] px-[7px] py-[4px] leading-tight"
                      style={{ top: `${pct(ghost.start)}%`, height: `${((ghost.end.getTime() - ghost.start.getTime()) / 3_600_000 / HOURS) * 100}%`, zIndex: 3, transformOrigin: "50% 0%" }}
                      initial={{ opacity: 0, scaleY: 0.3 }}
                      animate={{
                        opacity: 1,
                        scaleY: 1,
                        background: ghost.state === "created" ? "#ffedd5" : "rgba(249,115,22,0.10)",
                        borderColor: ghost.state === "created" ? "rgba(249,115,22,0)" : GHOST,
                        boxShadow: ghost.state === "created" ? "0 6px 18px rgba(249,115,22,0.35)" : "0 0 0 rgba(0,0,0,0)",
                      }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <span className="absolute inset-0 rounded-[7px]" style={{ border: ghost.state === "created" ? "none" : `2px dashed ${GHOST}` }} />
                      {ghost.state === "created" && <span className="absolute bottom-0 left-0 top-0 w-[4px]" style={{ background: GHOST }} />}
                      <div className="relative text-[12px] font-semibold tabular-nums" style={{ color: "#c2410c" }}>
                        {hm(ghost.start)}
                      </div>
                      <div className="relative truncate text-[13px] font-semibold" style={{ color: "#7c2d12" }}>
                        {ghost.title?.shown || (ghost.state === "ghost" ? "(Ohne Titel)" : "")}
                      </div>
                      {ghost.state === "created" && (
                        <motion.span
                          className="absolute right-[5px] top-[5px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#16a34a] text-white"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 18 }}
                        >
                          <Check size={12} />
                        </motion.span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                {isToday && nowPct > 0 && nowPct < 100 && (
                  <div className="pointer-events-none absolute left-0 right-0" style={{ top: `${nowPct}%`, zIndex: 4 }}>
                    <span className="absolute left-[-4px] top-[-4px] h-[9px] w-[9px] rounded-full bg-[#e5484d]" />
                    <span className="absolute left-0 right-0 top-0 h-[2px] bg-[#e5484d]" />
                  </div>
                )}
              </div>
            );
          })}
          <AnimatePresence>{ghost && ghost.state === "ghost" && dayIndex >= 0 && <QuickAdd key="quick" ghost={ghost} dayIndex={dayIndex} />}</AnimatePresence>
        </div>
      </div>
    </WindowShell>
  );
}

/** Google-Calendar-like quick add next to the new slot: title field, time, save. */
function QuickAdd({ ghost, dayIndex }: { ghost: NonNullable<ReturnType<typeof calendarView>["ghost"]>; dayIndex: number }) {
  const W = 268;
  const left = dayIndex < 4 ? `calc(46px + (100% - 46px) * ${(dayIndex + 1) / 5} + 8px)` : `calc(46px + (100% - 46px) * ${dayIndex / 5} - ${W + 8}px)`;
  const top = `clamp(4px, calc(${pct(ghost.start)}% - 34px), calc(100% - 158px))`;
  const date = ghost.start.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  return (
    <motion.div
      data-testid="calendar-quickadd"
      className="absolute rounded-[12px] bg-white p-[12px]"
      style={{ left, top, width: W, zIndex: 8, boxShadow: "0 16px 40px rgba(20,20,40,0.28), 0 0 0 1px rgba(0,0,0,0.06)" }}
      initial={{ opacity: 0, scale: 0.94, x: -8 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="border-b-2 pb-[5px] text-[17px] font-medium leading-tight" data-t="cal:title" data-tx="0.95" data-ty="0.2" style={{ borderColor: GHOST, color: ghost.title?.shown ? "#1d1d27" : "#a0a0ae" }}>
        {ghost.title?.shown || "Titel hinzufügen"}
        <Caret color={GHOST} on={!ghost.title || ghost.title.active} />
      </div>
      <div className="mt-[9px] text-[13.5px] text-[#55556a]">
        {date} · {hm(ghost.start)} – {hm(ghost.end)}
      </div>
      <div className="mt-[3px] text-[12.5px] text-[#8a8a98]">Videokonferenz · Einladung an Teilnehmende</div>
      <div className="mt-[10px] flex justify-end gap-[8px] text-[13.5px]">
        <span className="px-[10px] py-[5px] text-[#55556a]">Weitere Optionen</span>
        <span data-t="cal:save" className="rounded-[8px] px-[14px] py-[5px] font-semibold text-white" style={{ background: "#2563eb" }}>
          Speichern
        </span>
      </div>
    </motion.div>
  );
}

function EventBlock({ e }: { e: CalendarEvent }) {
  const s = new Date(e.start);
  const en = new Date(e.end);
  const tone = eventTone(e);
  const hours = (en.getTime() - s.getTime()) / 3_600_000;
  return (
    <div
      className="absolute left-[3px] right-[3px] overflow-hidden rounded-[6px] py-[3px] pl-[8px] pr-[5px] leading-[1.2]"
      style={{ top: `${pct(s)}%`, height: `calc(${(hours / HOURS) * 100}% - 2px)`, background: tone.bg, color: tone.text }}
    >
      <span className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: tone.bar }} />
      <div className="truncate text-[12.5px] font-semibold">{e.title}</div>
      {hours >= 0.9 && <div className="truncate text-[11.5px] opacity-75">{hm(s)} · {e.location}</div>}
    </div>
  );
}
