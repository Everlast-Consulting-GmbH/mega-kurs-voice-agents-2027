import type { CalendarEvent, ChatMessage, Email, Lead } from "@jarvis/contracts";
import { happened, playhead, typedChars, type Played } from "@/lib/agents";

// What each app window shows at `now`: the data snapshot plus everything its agent has
// visibly done so far. Pure, so the choreography is testable without a DOM.
//
// Action conventions (agreed with the backend, see the multi-agent mock scenario):
//   mail      open · select(entityId = email id) · type(field "body", text) · send
//   calendar  open · select(to = ISO start, e.g. 2026-10-12T15:00) · type(field "title", text) · create(entityId = new event id)
//   chat      open · select(entityId = channel) · type(text) · send(entityId = new message id)
//   crm       open · select(entityId = lead id) · move(entityId, from, to)

const lastOf = <T>(xs: T[], pred: (x: T) => boolean) => {
  for (let i = xs.length - 1; i >= 0; i--) if (pred(xs[i]!)) return xs[i]!;
  return undefined;
};

/** A type action on screen: the characters typed so far and whether the caret blinks. */
export type Typing = { text: string; shown: string; active: boolean };

function typing(played: Played[], now: number, field?: (p: Played) => boolean): Typing | null {
  const done = happened(played, now);
  const t = lastOf(done, (p) => p.action === "type" && (!field || field(p)));
  if (!t?.text) return null;
  const n = typedChars(t, now);
  return { text: t.text, shown: t.text.slice(0, n), active: now < t.end };
}

// ---- mail -------------------------------------------------------------------------------

export type MailView = {
  selectedId: string | null;
  draft: (Typing & { sent: boolean; sentAt: number | null }) | null;
  replied: string[];
};

export function mailView(emails: Email[], played: Played[], now: number): MailView {
  const done = happened(played, now);
  const sel = lastOf(done, (p) => (p.action === "select" || p.action === "type" || p.action === "send") && !!p.entityId && emails.some((e) => e.id === p.entityId));
  const inbox = emails.filter((e) => e.folder === "inbox");
  const selectedId = sel?.entityId ?? inbox.find((e) => e.unread && e.priority === "high")?.id ?? inbox[0]?.id ?? null;
  const typeAction = lastOf(done, (p) => p.action === "type");
  const t = typing(played, now);
  const send = typeAction ? lastOf(done, (p) => p.action === "send" && p.seq > typeAction.seq) : undefined;
  return { selectedId, draft: t ? { ...t, sent: !!send, sentAt: send?.hit ?? null } : null, replied: send && selectedId ? [selectedId] : [] };
}

// ---- calendar -----------------------------------------------------------------------------

export type Ghost = { start: Date; end: Date; title: Typing | null; state: "ghost" | "created"; createdAt: number | null };

/** The slot of a calendar select: ISO in `to`, else a time in the caption, on `today`. */
export function slotOf(p: Pick<Played, "to" | "caption" | "text">, today: Date): Date | null {
  if (p.to) {
    const iso = new Date(p.to);
    if (!Number.isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(p.to)) return iso;
    const hm = /^(\d{1,2})[:.](\d{2})$/.exec(p.to.trim());
    if (hm) return atTime(today, Number(hm[1]), Number(hm[2]));
  }
  // "15:00", "15 Uhr", "15.30 Uhr"; never a date like "12.10."
  const m = /\b(\d{1,2}):(\d{2})\b/.exec(p.caption) ?? /\b(\d{1,2})(?:\.(\d{2}))? Uhr/.exec(p.caption);
  return m ? atTime(today, Number(m[1]), Number(m[2] ?? 0)) : null;
}

const atTime = (d: Date, h: number, m: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);

export function calendarView(events: CalendarEvent[], played: Played[], now: number, today = new Date(now)): { ghost: Ghost | null } {
  const done = happened(played, now);
  const sel = lastOf(done, (p) => p.action === "select" || p.action === "move");
  const start = sel ? slotOf(sel, today) : null;
  if (!start) return { ghost: null };
  const create = lastOf(done, (p) => p.action === "create" && p.seq > sel!.seq);
  // once the real event is in the data (live refetch after the run) it replaces the ghost
  if (create?.entityId && events.some((e) => e.id === create.entityId)) return { ghost: null };
  const end = new Date(start.getTime() + 60 * 60_000);
  return { ghost: { start, end, title: typing(played, now), state: create ? "created" : "ghost", createdAt: create?.hit ?? null } };
}

// ---- chat ---------------------------------------------------------------------------------

export type ChatView = { channel: string; compose: Typing | null; sent: ChatMessage[] };

export function chatView(chat: Record<string, ChatMessage[]>, played: Played[], now: number, author = "Jarvis"): ChatView {
  const done = happened(played, now);
  const sel = lastOf(done, (p) => (p.action === "select" || p.action === "open") && !!p.entityId && p.entityId.replace(/^#/, "") in chat);
  const channel = sel?.entityId?.replace(/^#/, "") ?? (chat.vertrieb ? "vertrieb" : (Object.keys(chat)[0] ?? "allgemein"));
  const sent: ChatMessage[] = [];
  let compose: Typing | null = null;
  for (const p of done) {
    if (p.action === "type") compose = { text: p.text ?? "", shown: (p.text ?? "").slice(0, typedChars(p, now)), active: now < p.end };
    if (p.action === "send" && compose) {
      sent.push({ id: p.entityId ?? `sent-${p.seq}`, channel, author, text: compose.text, sentAt: new Date(p.hit).toISOString(), fromJarvis: true });
      compose = null;
    }
  }
  // the real message (live data after the run) replaces the local one
  const known = new Set((chat[channel] ?? []).map((m) => m.id));
  return { channel, compose, sent: sent.filter((m) => !known.has(m.id)) };
}

// ---- crm ----------------------------------------------------------------------------------

export type CrmView = {
  leads: Lead[];
  selectedId: string | null;
  /** the card in the air: picked up at `hit`, dropped at `end` */
  moving: { leadId: string; from: Lead["status"]; to: Lead["status"]; hit: number; end: number; flying: boolean } | null;
  movedAt: Record<string, number>;
};

const STATUSES = new Set<string>(["neu", "qualifiziert", "angebot", "verhandlung", "gewonnen", "verloren"]);
const asStatus = (s: string | undefined): Lead["status"] | null => (s && STATUSES.has(s) ? (s as Lead["status"]) : null);

export function crmView(leads: Lead[], played: Played[], now: number): CrmView {
  const { current } = playhead(played, now);
  const status = new Map<string, Lead["status"]>();
  const movedAt: Record<string, number> = {};
  let selectedId: string | null = null;
  let moving: CrmView["moving"] = null;
  for (const p of played) {
    if (p.start > now) break;
    if (p.action === "select" && p.entityId && p.hit <= now) selectedId = p.entityId;
    if (p.action !== "move" || !p.entityId) continue;
    const to = asStatus(p.to);
    const from = asStatus(p.from) ?? leads.find((l) => l.id === p.entityId)?.status ?? null;
    if (!to || !from) continue;
    selectedId = p.entityId;
    if (now >= p.end) {
      status.set(p.entityId, to);
      movedAt[p.entityId] = p.end;
    } else {
      // until the drop, the card belongs to its old column (or the air)
      status.set(p.entityId, from);
      if (p === current) moving = { leadId: p.entityId, from, to, hit: p.hit, end: p.end, flying: now >= p.hit };
    }
  }
  return { leads: leads.map((l) => (status.has(l.id) ? { ...l, status: status.get(l.id)! } : l)), selectedId, moving, movedAt };
}

// ---- small formatting helpers ---------------------------------------------------------------

export const euro = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

/** "08:52", "Gestern", "Fr." like a mail client's list. */
export function mailTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff <= 0) return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Gestern";
  if (diff < 7) return d.toLocaleDateString("de-DE", { weekday: "short" });
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

/** "vor 3 Min." for the reading pane. */
export function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long" });
}

export const initials = (name: string) =>
  name
    .replace(/^(Dr\.|Prof\.)\s+/, "")
    .split(/[\s·]+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const AVATAR = ["#f59e0b", "#0ea5e9", "#a855f7", "#ef4444", "#14b8a6", "#6366f1", "#ec4899", "#84cc16"];
export const avatarColor = (name: string) => AVATAR[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR.length]!;
