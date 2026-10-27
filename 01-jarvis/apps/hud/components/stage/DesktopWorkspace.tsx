"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import { useUi, type Workspace } from "@/lib/ui";
import { useAppData } from "@/lib/apps/data";
import { useCrmDemo, withOverrides } from "@/lib/apps/crmDemo";
import { useMailDemo, visibleMail } from "@/lib/apps/mailDemo";
import { APP_NAMES, desktopContext, desktopLead, rehearsalAnswer } from "@/lib/apps/desktop";
import type { MailDraft } from "@/lib/apps/offer";
import { useVoiceSession } from "@/lib/voice";
import { sfx } from "@/lib/sound/sfx";
import { ChatApp } from "../apps/ChatApp";
import { MailApp } from "../apps/MailApp";
import { CrmApp } from "../apps/CrmApp";
import { CalendarApp } from "../apps/CalendarApp";
import { OfferApp } from "../apps/OfferApp";
import { EASE } from "./layout";
import type { Played } from "@/lib/agents";

const EMPTY: Played[] = [];

export function composeOfferMail(draft: MailDraft) {
  const actions = useMailDemo.getState().actions;
  actions.prefill(draft);
  useUi.getState().openApp("mail");
  sfx.click();
}

/** A persistent user-opened app beside Jarvis, with a question about the selected record. */
export function DesktopWorkspace({ workspace, stageKey }: { workspace: Workspace; stageKey?: string }) {
  const leads = useAppData((s) => s.leads);
  const lead = desktopLead(leads, workspace.entityId);
  const openApp = useUi((s) => s.openApp);
  const close = () => { useUi.getState().closeApp(stageKey); sfx.click(); };
  return (
    <motion.div data-testid="desktop-workspace" data-app={workspace.app} className="absolute z-20 flex flex-col gap-4" style={{ left: 370, top: 118, width: 1472, height: 818 }}
      initial={{ opacity: 0, x: -50, y: 50, scale: 0.92 }} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.96 }} transition={{ duration: 0.42, ease: EASE }}>
      <div className="min-h-0 flex-1">
        {workspace.app === "chat" && <ChatApp played={EMPTY} channel={workspace.entityId} onClose={close} />}
        {workspace.app === "mail" && <MailApp played={EMPTY} interactive onClose={close} />}
        {workspace.app === "crm" && <CrmApp played={EMPTY} interactive onClose={close} initialLeadId={workspace.entityId} onSelect={(l) => openApp("crm", l.id)} onOffer={(l) => openApp("offer", l.id)} />}
        {workspace.app === "calendar" && <CalendarApp played={EMPTY} onClose={close} />}
        {workspace.app === "offer" && <OfferApp selectedLeadId={workspace.entityId} onSelect={(l) => openApp("offer", l.id)} onClose={close} onCompose={composeOfferMail} />}
      </div>
      <DesktopQuestion key={`${workspace.app}-${workspace.entityId ?? ""}`} workspace={workspace} />
    </motion.div>
  );
}

function DesktopQuestion({ workspace }: { workspace: Workspace }) {
  const v = useVoiceSession();
  const baseData = useAppData(useShallow((s) => ({ leads: s.leads, emails: s.emails, events: s.events, chat: s.chat })));
  const crm = useCrmDemo((s) => s.state);
  const data = { ...baseData, leads: withOverrides(baseData.leads, crm) };
  const mailState = useMailDemo();
  const mail = visibleMail(mailState, data.emails);
  const active = workspace.app === "mail" && mail ? { ...workspace, entityId: mail.id } : workspace;
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const ask = (text: string) => {
    if (!text.trim()) return;
    try {
      if (v.ask(text, desktopContext(active, data, mail))) setAnswer("Frage an Jarvis gesendet. Er antwortet im Gespräch.");
      else if (v.provider === "mock") setAnswer(rehearsalAnswer(text, active, data, mail));
      else { setAnswer("Starte das Gespräch unten, um Jarvis zu fragen."); return; }
    } catch { setAnswer("Die Frage konnte nicht gesendet werden. Bitte erneut versuchen."); return; }
    setQuestion("");
    sfx.click();
  };
  const quick = workspace.app === "chat" ? "Was wurde dem Team mitgeteilt?" : workspace.app === "crm" ? "Was ist der nächste Schritt?" : workspace.app === "offer" ? "Was kostet das Angebot?" : workspace.app === "mail" ? "Worum geht es in dieser Mail?" : "Welche Termine stehen an?";
  return (
    <div className="rounded-[18px] border border-white/10 bg-[#0f1227]/90 p-3 backdrop-blur-xl">
      <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="flex items-center gap-3">
        <span className="shrink-0 px-2 text-[16px] text-[#ffc9a3]">Jarvis · {APP_NAMES[workspace.app]}</span>
        <input data-testid="desktop-question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Frag Jarvis zu diesem Fenster …" aria-label="Frage an Jarvis" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[17px] text-white outline-none focus:border-[#ffc9a3]/60" />
        <button type="button" data-testid="desktop-quick-question" onClick={() => ask(quick)} className="rounded-xl bg-white/5 px-4 py-3 text-[15px] text-white/70 hover:bg-white/10">{quick}</button>
        <button type="submit" className="rounded-xl bg-[#ffc9a3] px-5 py-3 text-[16px] font-medium text-[#17182d]">Fragen</button>
      </form>
      {answer && <motion.p role="status" data-testid="desktop-answer" className="mt-3 px-3 text-[17px] leading-relaxed text-white/90" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>{answer}</motion.p>}
    </div>
  );
}
