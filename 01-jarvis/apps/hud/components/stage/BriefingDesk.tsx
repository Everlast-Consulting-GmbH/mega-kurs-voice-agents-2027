"use client";
import { motion } from "motion/react";
import { useHud } from "@/lib/events/store";
import { useAppData } from "@/lib/apps/data";
import { currentBriefingIndex } from "@/lib/stage";
import { avatarColor, euro, initials, mailTime } from "@/lib/apps/views";
import type { BriefingItem } from "@/lib/events/reducer";
import { WindowShell } from "../apps/WindowShell";
import { eventTone } from "../apps/CalendarApp";
import { COLUMNS, scoreTone } from "../apps/CrmApp";
import { BRIEFING_WINDOWS, type OrbPose } from "./layout";

// Bild C: Jarvis does not open cards, he leafs through the real calendar, inbox and CRM. The
// window of the point he is talking about comes forward, the matching rows light up.

const WINDOW_OF: Record<BriefingItem["icon"], "calendar" | "mail" | "crm" | null> = {
  calendar: "calendar",
  mail: "mail",
  alert: "mail",
  lead: "crm",
  money: "crm",
  task: null,
  weather: null,
};
const PEACH_BG = "rgba(255,170,120,0.16)";

/** Words of the current briefing point that pick out rows (names, companies). */
export function briefingKeys(item: Pick<BriefingItem, "title" | "detail"> | undefined): string[] {
  if (!item) return [];
  return `${item.title} ${item.detail}`
    .split(/[\s,.:;!?()·–-]+/)
    .filter((w) => /^\p{Lu}\p{L}{3,}$/u.test(w) && !/^(Termine?|Mails?|Leads?|Heute|Erster|Score|Angebot|Pipeline|Dringende?)$/.test(w));
}
const hit = (text: string, keys: string[]) => keys.some((k) => text.includes(k));

export function BriefingDesk({ orb, explain }: { orb: OrbPose; explain: boolean }) {
  const items = useHud((s) => s.briefing.items);
  const idx = currentBriefingIndex(items);
  const current = items.find((i) => i.index === idx);
  const focus = current ? WINDOW_OF[current.icon] : null;
  const keys = briefingKeys(current);
  const lift = explain ? -40 : 0;

  return (
    <motion.div data-testid="briefing-desk" data-focus={focus ?? ""} className="pointer-events-none absolute inset-0" initial="hidden" animate="shown" exit="gone" variants={{ hidden: {}, shown: {}, gone: { transition: { when: "afterChildren" } } }}>
      {BRIEFING_WINDOWS.map(({ app, rect, rotate }, i) => {
        const on = focus === app;
        const dx = orb.cx - (rect.left + rect.width / 2);
        const dy = orb.cy - (rect.top + rect.height / 2);
        return (
          <motion.div
            key={app}
            data-testid={`briefing-window-${app}`}
            data-on={on || undefined}
            className="absolute"
            style={{ left: rect.left, top: rect.top + lift, width: rect.width, height: rect.height, zIndex: on ? 7 : 5 }}
            variants={{
              hidden: { x: dx, y: dy, scale: 0.1, rotate: 0, opacity: 0 },
              shown: { x: 0, y: 0, scale: 1, rotate, opacity: 1, transition: { type: "spring", stiffness: 120, damping: 18, delay: 0.1 + i * 0.12 } },
              gone: { x: dx, y: dy, scale: 0.1, opacity: 0, transition: { duration: 0.55, ease: [0.55, 0, 0.75, 0.2], delay: i * 0.05 } },
            }}
          >
            {/* the window Jarvis talks about comes forward, the others step back a little */}
            <motion.div className="h-full w-full" initial={false} animate={{ y: on ? -14 : focus ? 6 : 0, scale: on ? 1.05 : focus ? 0.96 : 1 }} transition={{ type: "spring", stiffness: 160, damping: 20 }}>
              {app === "calendar" && <CalendarToday keys={on ? keys : []} on={on} />}
              {app === "mail" && <MailUrgent keys={on ? keys : []} on={on} />}
              {app === "crm" && <HotDeals keys={on ? keys : []} on={on} />}
            </motion.div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

const RING = "rgba(255,201,163,0.9)";
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

function CalendarToday({ keys, on }: { keys: string[]; on: boolean }) {
  const events = useAppData((s) => s.events);
  const today = new Date();
  const list = events.filter((e) => new Date(e.start).toDateString() === today.toDateString()).sort((a, b) => a.start.localeCompare(b.start));
  return (
    <WindowShell title="Kalender – Heute" ring={on ? RING : null} right={today.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}>
      <div className="flex h-full flex-col gap-[10px] px-[20px] py-[16px]">
        {list.length === 0 && <div className="text-[19px] text-[#8a8a98]">Keine Termine heute</div>}
        {list.slice(0, 4).map((e) => {
          const tone = eventTone(e);
          const lit = hit(`${e.title} ${e.attendees.join(" ")}`, keys);
          return (
            <div key={e.id} className="flex items-center gap-[14px] rounded-[10px] px-[10px] py-[7px]" style={{ background: lit ? PEACH_BG : "transparent", transition: "background 0.4s" }}>
              <span className="w-[62px] shrink-0 text-[19px] font-semibold tabular-nums text-[#1f2330]">{hhmm(e.start)}</span>
              <span className="h-[40px] w-[4px] shrink-0 rounded-full" style={{ background: tone.bar }} />
              <span className="min-w-0">
                <span className="block truncate text-[19px] font-medium text-[#1f2330]">{e.title}</span>
                <span className="block truncate text-[15px] text-[#8a8a98]">
                  bis {hhmm(e.end)} · {e.location}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </WindowShell>
  );
}

function MailUrgent({ keys, on }: { keys: string[]; on: boolean }) {
  const emails = useAppData((s) => s.emails);
  const inbox = emails.filter((e) => e.folder === "inbox").sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const urgent = inbox.filter((e) => e.unread && e.priority === "high");
  const list = (urgent.length ? [...urgent, ...inbox.filter((e) => !urgent.includes(e))] : inbox).slice(0, 4);
  return (
    <WindowShell title={urgent.length ? `Mail – ${urgent.length} dringend` : "Mail – Posteingang"} ring={on ? RING : null}>
      <div className="flex h-full flex-col">
        {list.map((m) => {
          const lit = hit(`${m.fromName} ${m.subject}`, keys);
          const bold = m.unread;
          return (
            <div key={m.id} className="flex items-center gap-[12px] border-b border-[#f0f0f5] px-[18px] py-[11px]" style={{ background: lit ? PEACH_BG : "transparent", transition: "background 0.4s" }}>
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white" style={{ background: avatarColor(m.fromName) }}>
                {initials(m.fromName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-[8px]">
                  {bold && <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-[#6c5ce7]" />}
                  <span className={`truncate text-[18px] ${bold ? "font-semibold text-[#14141c]" : "text-[#3c3c48]"}`}>{m.fromName.split(" · ")[0]}</span>
                  <span className="ml-auto shrink-0 text-[14px] text-[#9a9aa8]">{mailTime(m.receivedAt, new Date())}</span>
                </span>
                <span className={`block truncate text-[17px] ${bold ? "text-[#22222c]" : "text-[#6b6b7b]"}`}>{m.subject}</span>
              </span>
            </div>
          );
        })}
      </div>
    </WindowShell>
  );
}

function HotDeals({ keys, on }: { keys: string[]; on: boolean }) {
  const leads = useAppData((s) => s.leads);
  const open = leads.filter((l) => l.status !== "gewonnen" && l.status !== "verloren").sort((a, b) => b.score - a.score).slice(0, 4);
  return (
    <WindowShell title="CRM – heißeste Deals" ring={on ? RING : null}>
      <div className="flex h-full flex-col px-[14px] pt-[8px]">
        {open.map((l) => {
          const lit = hit(`${l.company} ${l.name}`, keys);
          const tone = scoreTone(l.score);
          const col = COLUMNS.find((c) => c.status === l.status);
          return (
            <div key={l.id} className="flex items-center gap-[12px] border-b border-[#f0f0f5] px-[8px] py-[11px]" style={{ background: lit ? PEACH_BG : "transparent", borderRadius: lit ? 10 : 0, transition: "background 0.4s" }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[19px] font-semibold text-[#111827]">{l.company}</span>
                <span className="flex items-center gap-[7px] text-[15px] text-[#6b7280]">
                  <span className="h-[8px] w-[8px] rounded-full" style={{ background: col?.color ?? "#94a3b8" }} />
                  {col?.label ?? l.status} · {l.city}
                </span>
              </span>
              <span className="text-[18px] font-semibold tabular-nums text-[#111827]">{euro(l.valueEur)}</span>
              <span className="w-[42px] rounded-[7px] py-[2px] text-center text-[16px] font-semibold tabular-nums" style={{ background: tone.bg, color: tone.fg }}>
                {l.score}
              </span>
            </div>
          );
        })}
      </div>
    </WindowShell>
  );
}
