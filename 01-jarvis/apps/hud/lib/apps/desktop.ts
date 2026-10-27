import type { Lead, JarvisEvent } from "@jarvis/contracts";
import type { AppData } from "./fixtures";
import type { DesktopApp, Workspace } from "@/lib/ui";
import { initialMailDemo, visibleMail, type VisibleMail } from "./mailDemo";
import { euro } from "./views";
import { STATUS_LABEL } from "./crmDemo";
import { findLead } from "./offer";
import { desktopCommand } from "./commands";
import { stageItem, stageMode } from "@/lib/stage";
import type { HudState } from "@/lib/events/reducer";

export const APP_NAMES = { mail: "Mail", crm: "CRM", offer: "Angebot", calendar: "Kalender", chat: "Team" } as const;

export function desktopEvent(e: JarvisEvent, state: HudState, leads: Lead[], now = Date.now()): Workspace | "close" | null {
  if (e.type === "approval.requested" || e.type === "run.planned" || e.type === "agent.spawned" || e.type === "ui.widget" || (e.type === "briefing.item" && e.payload.index === 0) || (e.type === "task.created" && e.payload.kind === "computer_use") || (e.type === "call.state" && ["dialing", "ringing", "connected"].includes(e.payload.status))) return "close";
  const item = stageItem(state, now);
  const mode = stageMode(state, now);
  const locked = mode === "call" || item?.kind === "approval" || item?.kind === "cu" || (item?.kind === "run" && item.phase === "work");
  if (e.type === "transcript.final" && e.payload.role === "user") {
    const command = desktopCommand(e.payload.text, leads);
    return command === "close" ? command : locked ? null : command;
  }
  if (e.type !== "ui.focus" && e.type !== "tool.finished") return null;
  if (e.type === "ui.focus" && !["mail", "event", "lead"].includes(e.payload.entity)) return "close";
  if (!desktopDisplayAllowed(state, now)) return null;
  if (e.type === "tool.finished") {
    if (!e.payload.ok || e.payload.taskId) return null;
    const apps: Record<string, DesktopApp> = { list_emails: "mail", read_email: "mail", reply_email: "mail", list_leads: "crm", get_lead: "crm", move_deal: "crm", list_events: "calendar", create_event: "calendar" };
    const app = apps[e.payload.tool];
    return app ? { app } : null;
  }
  const f = e.payload;
  if (f.entity === "mail") return { app: "mail", entityId: f.entityId };
  if (f.entity === "event") return { app: "calendar", entityId: f.entityId };
  const lastQuestion = [...state.turns].reverse().find((t) => t.role === "user" && now - t.updatedAt < 20_000)?.text ?? "";
  return { app: /angebot|offerte/i.test(`${f.label} ${lastQuestion}`) ? "offer" : "crm", entityId: findLead(f, leads)?.id ?? f.entityId };
}

/** Successful tool results may reveal an app, while native approval/agent scenes keep priority. */
export function desktopDisplayAllowed(state: HudState, now = Date.now()): boolean {
  const item = stageItem(state, now);
  const mode = stageMode(state, now);
  const locked = mode === "call" || item?.kind === "approval" || item?.kind === "cu" || (item?.kind === "run" && item.phase === "work");
  const lastUser = [...state.turns].reverse().find((t) => t.role === "user");
  const freshRequest = !!lastUser && now - lastUser.updatedAt < 20_000 && lastUser.startedAt >= (item?.at ?? Infinity);
  return !locked && (mode === "calm" || item?.kind === "focus" || freshRequest);
}

export function desktopLead(leads: Lead[], id?: string): Lead | undefined {
  if (id) return leads.find((l) => l.id === id);
  return leads.find((l) => /müller/i.test(l.company)) ?? leads[0];
}

/** The same visible snapshot is used for live voice context and the offline rehearsal. */
export function desktopContext(workspace: Workspace, data: AppData, mail?: VisibleMail | null): string {
  const lead = desktopLead(data.leads, workspace.entityId);
  if (workspace.app === "crm" || workspace.app === "offer") {
    return lead ? `${APP_NAMES[workspace.app]} ist offen: ${lead.company}, Kontakt ${lead.name}, E-Mail ${lead.email}, Phase ${STATUS_LABEL[lead.status]}, Wert ${euro(lead.valueEur)}, Score ${lead.score}/100. Nächster Schritt: ${lead.nextStep}. Demo auf Testdaten.` : "Der angefragte Lead ist nicht geladen. Wähle einen Datensatz im Fenster.";
  }
  if (workspace.app === "mail") {
    const email = mail === undefined ? visibleMail({ ...initialMailDemo(), selectedId: workspace.entityId ?? null }, data.emails) : mail;
    return email ? `Mail ist offen, ${email.draft ? "ungesendeter Entwurf" : `Ordner ${email.folder === "sent" ? "Gesendet" : "Posteingang"}`}: ${email.subject}, von ${email.fromName} (${email.from}), an ${email.to}. Inhalt: ${email.body}. Demo auf Testdaten.` : "Mail ist offen. Keine Nachrichten geladen.";
  }
  if (workspace.app === "chat") {
    const channel = workspace.entityId ?? "vertrieb";
    return `Team-Chat #${channel} ist offen. Nachrichten: ${(data.chat[channel] ?? []).map((m) => `${m.author}: ${m.text}`).join("; ")}. Demo auf Testdaten.`;
  }
  return `Kalender ist offen. Sichtbare Termine: ${data.events.map((e) => `${e.title}, ${e.start}`).join("; ")}. Demo auf Testdaten.`;
}

export function rehearsalAnswer(question: string, workspace: Workspace, data: AppData, mail?: VisibleMail | null): string {
  const lead = desktopLead(data.leads, workspace.entityId);
  if ((workspace.app === "crm" || workspace.app === "offer") && lead) {
    if (/preis|kost|wert|angebot|umfang/i.test(question)) return `Für ${lead.company} sind ${euro(lead.valueEur)} hinterlegt. Das Angebot zeigt die einzelnen Leistungen und den Gesamtbetrag.`;
    return `${lead.company} steht in „${STATUS_LABEL[lead.status]}“ mit Score ${lead.score}. Als nächster Schritt ist hinterlegt: ${lead.nextStep}.`;
  }
  if ((workspace.app === "crm" || workspace.app === "offer") && !lead) return "Der angefragte Lead ist nicht geladen. Wähle einen Datensatz im Fenster.";
  if (workspace.app === "mail") {
    const email = mail === undefined ? visibleMail({ ...initialMailDemo(), selectedId: workspace.entityId ?? null }, data.emails) : mail;
    if (email?.draft) return `Der Entwurf an ${email.to || "noch keinen Empfänger"} hat den Betreff „${email.subject || "noch keinen Betreff"}“. Er wurde noch nicht gesendet.`;
    if (email?.folder === "sent") return `Diese Demo-Mail an ${email.to} wurde gesendet: „${email.subject}“. Sie bleibt hier im Gesendet-Ordner.`;
    return email ? `${email.fromName} schreibt zu „${email.subject}“. Mit „Mit Jarvis antworten“ kannst du die passende Antwort vorbereiten und anschließend abschicken.` : "Im Posteingang ist gerade keine Mail vorhanden.";
  }
  if (workspace.app === "chat") return (data.chat[workspace.entityId ?? "vertrieb"] ?? []).at(-1)?.text ?? "Im Kanal sind keine Nachrichten geladen.";
  return `${data.events.length} Termine stehen im Kalender. Du kannst jeden Termin im Wochenplan ansehen.`;
}
