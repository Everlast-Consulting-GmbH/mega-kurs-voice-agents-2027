import type { Lead } from "@jarvis/contracts";
import type { Workspace } from "@/lib/ui";

const fold = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss");

/** Reading questions should reveal the inbox without performing a write or treating help as navigation. */
export function mailReadingRequest(text: string): boolean {
  const t = fold(text);
  return /\b(e[- ]?mails?|mails?|postfach|posteingang)\b/.test(t)
    && !/\b(nicht|keine?|niemals|ohne|schreib\w*|send\w*|versend\w*|verschick\w*|verfass\w*|antworte\w*|losch\w*|entwurf|einlad\w*)\b/.test(t)
    && !/\bwie\s+(offne|kann|konnte|soll|funktioniert|geht|erstelle|schreibe)\b/.test(t)
    && /\b(welche|wie\s*viele|habe?\s+ich|haben\s+wir|gibt\s+es|was\s+(steht|ist|gibt|habe)|lies|lese|vorlesen|zusammenfass\w*)\b/.test(t);
}

/** Only local window navigation. Never sends mail, changes data or grants approval. */
export function desktopCommand(text: string, leads: Lead[]): Workspace | "close" | null {
  const t = fold(text);
  if (mailReadingRequest(text)) return { app: "mail" };
  if (/\b(nicht|keine?|niemals|ohne)\b/.test(t)) return null;
  if (/\b(wie|warum|wieso)\b/.test(t) || /\b(diagramm|statistik|chart)\b/.test(t)) return null;
  if (/\b(schliess\w*|zumachen|schliessen)\b/.test(t) && /\b(fenster|ansicht|mail\w*|crm|angebot|kalender)\b/.test(t)) return "close";
  if (/\bmach\w*\b.+\b(fenster|ansicht)\b.+\bzu\b/.test(t)) return "close";
  const open = /\b(offne\w*|zeig\w*|zeige\w*|anzeigen|einblenden|aufmachen|auf\s+machen)\b/.test(t)
    || /\b(mach\w*|ruf\w*)\b.+\b(auf|anzeigen)\b/.test(t);
  if (!open) return null;
  const app = /\b(angebot\w*|offerte\w*)\b/.test(t) ? "offer"
    : /\b(crm|leads?|pipeline)\b/.test(t) ? "crm"
    : /\b(e[- ]?mails?|postfach|posteingang|mails?)\b/.test(t) ? "mail"
    : /\b(kalender|termine?)\b/.test(t) ? "calendar" : null;
  if (!app) return null;
  const named = leads.find((lead) => {
    const company = fold(lead.company).replace(/\b(gmbh|ag|kg|und|partner)\b/g, "").trim();
    return company.length >= 4 && t.includes(company);
  });
  const fallback = leads.find((lead) => /muller/i.test(fold(lead.company))) ?? leads[0];
  if (!named && (app === "crm" || app === "offer") && /\b(fur|von|zu)\s+\S/.test(t)) return null;
  const lead = named ?? fallback;
  return { app, ...((app === "crm" || app === "offer") && lead ? { entityId: lead.id } : {}) };
}
