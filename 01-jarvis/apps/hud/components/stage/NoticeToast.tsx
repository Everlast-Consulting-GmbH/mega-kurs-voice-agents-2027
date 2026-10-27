"use client";
import { AnimatePresence, motion } from "motion/react";
import { useHud } from "@/lib/events/store";
import { activeNotice } from "@/lib/derived";
import { useNow } from "@/lib/hooks";
import { useUi } from "@/lib/ui";
import type { Notice } from "@/lib/events/reducer";
import { Bell, Calendar, Inbox } from "../apps/icons";

const APP: Record<string, { name: string; color: string; icon: React.ReactNode }> = {
  mail: { name: "Mail", color: "#6c5ce7", icon: <Inbox size={22} /> },
  event: { name: "Kalender", color: "#f97316", icon: <Calendar size={22} /> },
  lead: { name: "CRM", color: "#16a34a", icon: <Bell size={22} /> },
};

/** Bild C: a notice comes in like a macOS notification, top right, before Jarvis interrupts. */
export function NoticeToast() {
  const now = useNow(500);
  const dismissed = useUi((s) => s.dismissed);
  const dismiss = useUi((s) => s.dismissNotice);
  const notice = useHud((s) => activeNotice(s, now, dismissed));
  return (
    <div className="absolute" style={{ right: 38, top: 96, width: 430, zIndex: 60 }}>
      <AnimatePresence>{notice && <Toast key={notice.noticeId} n={notice} onClose={() => dismiss(notice.noticeId)} />}</AnimatePresence>
    </div>
  );
}

function Toast({ n, onClose }: { n: Notice; onClose: () => void }) {
  const app = APP[n.entity ?? ""] ?? { name: "Jarvis", color: "#7c6cf0", icon: <Bell size={22} /> };
  return (
    <motion.button
      type="button"
      data-testid="notice-toast"
      data-severity={n.severity}
      onClick={onClose}
      className="flex w-full items-start gap-[14px] rounded-[20px] px-[16px] py-[14px] text-left"
      style={{ background: "rgba(246,246,250,0.94)", color: "#1c1c22", boxShadow: "0 22px 50px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.5)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      initial={{ opacity: 0, x: 60, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.35 } }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[11px] text-white" style={{ background: app.color, boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.12)" }}>
        {app.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between text-[14px] text-[#6e6e78]">
          <span className="font-medium uppercase tracking-[0.06em]">{app.name}</span>
          <span>jetzt</span>
        </span>
        <span className="block truncate text-[18px] font-semibold leading-snug">{n.title}</span>
        <span className="line-clamp-2 block text-[17px] leading-snug text-[#3a3a44]">{n.detail}</span>
      </span>
    </motion.button>
  );
}
