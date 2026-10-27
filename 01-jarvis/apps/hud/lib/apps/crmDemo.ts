import type { Lead } from "@jarvis/contracts";
import { create } from "zustand";
import { ago } from "./views";

// Local, user-driven CRM state for the interactive demo window. Nothing here is persisted or sent:
// moves, drafts and offer clicks only change this state, kept apart from the agent playback view.

export type CrmStatus = Lead["status"];
export type CrmFilter = "alle" | "heiss" | CrmStatus;
export type CrmLogEntry = { seq: number; leadId: string; kind: "move" | "draft" | "offer"; from?: CrmStatus; to?: CrmStatus };
export type CrmNotice = { seq: number; leadId: string; text: string; tone: "success" | "info" };

export type CrmDemoState = {
  selectedId: string | null;
  query: string;
  filter: CrmFilter;
  overrides: Record<string, CrmStatus>;
  log: CrmLogEntry[];
  drafts: Record<string, string>;
  notice: CrmNotice | null;
  seq: number;
};

export type CrmDemoAction =
  | { type: "select"; id: string }
  | { type: "close" }
  | { type: "search"; query: string }
  | { type: "filter"; filter: CrmFilter }
  | { type: "move"; lead: Lead; to: CrmStatus }
  | { type: "draft"; lead: Lead }
  | { type: "offer"; lead: Lead; linked: boolean }
  | { type: "dismiss" };

export const initialCrmDemo: CrmDemoState = { selectedId: null, query: "", filter: "alle", overrides: {}, log: [], drafts: {}, notice: null, seq: 0 };

/** One local workspace snapshot shared by the board, its question box and reopening the app. */
export const useCrmDemo = create<{ state: CrmDemoState; dispatch: (a: CrmDemoAction) => void; reset: () => void }>()((set) => ({
  state: initialCrmDemo,
  dispatch: (action) => set((s) => ({ state: crmDemoReducer(s.state, action) })),
  reset: () => set({ state: initialCrmDemo }),
}));

export const STATUS_LABEL: Record<CrmStatus, string> = {
  neu: "Neu",
  qualifiziert: "Qualifiziert",
  angebot: "Angebot",
  verhandlung: "Verhandlung",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};
export const STATUS_ORDER: CrmStatus[] = ["neu", "qualifiziert", "angebot", "verhandlung", "gewonnen", "verloren"];
const PIPELINE: CrmStatus[] = ["neu", "qualifiziert", "angebot", "verhandlung", "gewonnen"];
const STAGE_EVENT: Record<CrmStatus, string> = {
  neu: "Lead erfasst",
  qualifiziert: "Qualifiziert",
  angebot: "Angebot versendet",
  verhandlung: "In Verhandlung",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};
export const HOT_SCORE = 85;

export function nextStatus(status: CrmStatus): CrmStatus | null {
  const i = PIPELINE.indexOf(status);
  return i < 0 || i === PIPELINE.length - 1 ? null : PIPELINE[i + 1]!;
}

export function crmDemoReducer(s: CrmDemoState, a: CrmDemoAction): CrmDemoState {
  switch (a.type) {
    case "select":
      return { ...s, selectedId: a.id };
    case "close":
      return { ...s, selectedId: null };
    case "search":
      return { ...s, query: a.query };
    case "filter":
      return { ...s, filter: a.filter };
    case "dismiss":
      return { ...s, notice: null };
    case "move": {
      const from = s.overrides[a.lead.id] ?? a.lead.status;
      if (from === a.to) return s;
      const seq = s.seq + 1;
      return {
        ...s,
        seq,
        overrides: { ...s.overrides, [a.lead.id]: a.to },
        log: [...s.log, { seq, leadId: a.lead.id, kind: "move", from, to: a.to }],
        notice: { seq, leadId: a.lead.id, tone: "success", text: `${a.lead.company} von ${STATUS_LABEL[from]} nach ${STATUS_LABEL[a.to]} verschoben (lokal simuliert)` },
      };
    }
    case "draft": {
      const seq = s.seq + 1;
      return {
        ...s,
        seq,
        drafts: { ...s.drafts, [a.lead.id]: draftMessage(a.lead) },
        log: [...s.log, { seq, leadId: a.lead.id, kind: "draft" }],
        notice: { seq, leadId: a.lead.id, tone: "info", text: `Entwurf an ${a.lead.name} vorbereitet. Nur lokal, nichts gesendet.` },
      };
    }
    case "offer": {
      const seq = s.seq + 1;
      return {
        ...s,
        seq,
        log: [...s.log, { seq, leadId: a.lead.id, kind: "offer" }],
        notice: a.linked
          ? { seq, leadId: a.lead.id, tone: "success", text: `Angebot für ${a.lead.company} geöffnet` }
          : { seq, leadId: a.lead.id, tone: "info", text: `Angebotsansicht ist in dieser Demo nicht verbunden` },
      };
    }
  }
}

/** Leads with the local moves applied; the deal the agent is dragging keeps its playback status. */
export function withOverrides(leads: Lead[], s: CrmDemoState, agentLeadId?: string | null): Lead[] {
  return leads.map((l) => {
    const status = s.overrides[l.id];
    return status && status !== l.status && l.id !== agentLeadId ? { ...l, status } : l;
  });
}

const fold = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function matchesLead(lead: Lead, query: string, filter: CrmFilter): boolean {
  if (filter === "heiss" ? lead.score < HOT_SCORE : filter !== "alle" && lead.status !== filter) return false;
  const q = fold(query.trim());
  if (!q) return true;
  const hay = fold([lead.company, lead.name, lead.city, lead.email, lead.nextStep, lead.id].join(" "));
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export const visibleLeads = (leads: Lead[], s: CrmDemoState, agentLeadId?: string | null) =>
  withOverrides(leads, s, agentLeadId).filter((l) => matchesLead(l, s.query, s.filter));

/** A deterministic follow-up draft built only from the deal's own fields. */
export function draftMessage(lead: Lead): string {
  return [
    `Guten Tag ${lead.name},`,
    "",
    `vielen Dank für den guten Austausch. Als nächsten Schritt schlage ich vor: ${lead.nextStep}.`,
    "Passt Ihnen dafür ein kurzer Termin in dieser oder der nächsten Woche?",
    "",
    "Viele Grüße",
  ].join("\n");
}

export type TimelineEntry = { key: string; label: string; detail?: string; when?: string; local: boolean };

/** Local actions (newest first), then the last contact and the phases the deal has passed. */
export function leadTimeline(lead: Lead, log: CrmLogEntry[], now: number): TimelineEntry[] {
  const local: TimelineEntry[] = log
    .filter((e) => e.leadId === lead.id)
    .reverse()
    .map((e) => ({
      key: `local-${e.seq}`,
      label: e.kind === "move" ? `Verschoben nach ${STATUS_LABEL[e.to!]}` : e.kind === "draft" ? "Nachricht vorbereitet" : "Angebot angesehen",
      detail: e.kind === "move" ? `vorher ${STATUS_LABEL[e.from!]}` : undefined,
      when: "gerade eben · lokal",
      local: true,
    }));
  const reached = lead.status === "verloren" ? ["verloren" as const] : [];
  const idx = PIPELINE.indexOf(lead.status);
  const stages = [...reached, ...PIPELINE.slice(0, idx < 0 ? 1 : idx + 1).reverse()].map((st) => ({ key: `stage-${st}`, label: STAGE_EVENT[st], local: false }));
  return [...local, { key: "contact", label: "Letzter Kontakt", detail: lead.notes, when: ago(lead.lastContactAt, now), local: false }, ...stages];
}
