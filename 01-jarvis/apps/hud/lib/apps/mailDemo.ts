"use client";
import { create } from "zustand";
import type { Email } from "@jarvis/contracts";
import { DEMO_USER, isoLocal } from "./fixtures";

// Local state of the interactive mail window (manual desktop, YouTube demo). Nothing here
// leaves the browser: "sending" only appends to a local sent folder. The store lives at
// module level, so closing and reopening the window keeps the sent demo mails. The shared
// app data store (./data) stays untouched.

export type MailFolder = "inbox" | "sent";

export type SentMail = {
  id: string;
  to: string;
  toName: string;
  subject: string;
  body: string;
  sentAt: string;
  inReplyTo: string | null;
  invite: boolean;
};

/** A running AI draft: the full text and how many characters are on screen. */
export type AiTyping = { text: string; pos: number };

export type Compose = {
  mode: "reply" | "new";
  replyTo: string | null;
  to: string;
  toName: string;
  subject: string;
  body: string;
  invite: boolean;
  ai: AiTyping | null;
};

export type MailDemoState = {
  folder: MailFolder;
  selectedId: string | null;
  /** Search text of the list; shared so the visible selection is the same everywhere. */
  query: string;
  compose: Compose | null;
  /** Drafts pushed aside by a prefilled mail (offer); the newest comes back on discard or send. */
  stash: Compose[];
  sent: SentMail[];
  read: string[];
  /** Last successful send, drives the confirmation toast. */
  lastSent: { id: string; toName: string; seq: number } | null;
};

export const initialMailDemo = (): MailDemoState => ({ folder: "inbox", selectedId: null, query: "", compose: null, stash: [], sent: [], read: [], lastSent: null });

export const DEMO_ACCOUNT = `${DEMO_USER.toLowerCase()}@leos-agentur.example`;

const displayName = (fromName: string) => fromName.split(" · ")[0]!.trim();
const reSubject = (s: string) => (/^(re|aw):/i.test(s.trim()) ? s.trim() : `Re: ${s.trim()}`);
const isAddress = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const nameFromAddress = (addr: string) => addr.trim().split("@")[0]!.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ---- pure transitions ---------------------------------------------------------------------

export function selectMail(s: MailDemoState, id: string): MailDemoState {
  return { ...s, selectedId: id, read: s.read.includes(id) ? s.read : [...s.read, id], compose: s.compose && { ...s.compose, ai: null } };
}

export function openFolder(s: MailDemoState, folder: MailFolder): MailDemoState {
  return { ...s, folder, selectedId: null, compose: s.compose && { ...s.compose, ai: null } };
}

export function setQuery(s: MailDemoState, query: string): MailDemoState {
  return { ...s, query };
}

/** Reveal the inbox while keeping any started draft available in the draft folder. */
export function browseInbox(s: MailDemoState): MailDemoState {
  const stash = s.compose && hasContent(s.compose) ? [...s.stash, { ...s.compose, ai: null }] : s.stash;
  return { ...s, folder: "inbox", selectedId: null, query: "", compose: null, stash };
}

/** Shows one mail, e.g. after a ui.focus; picks the folder the id lives in. */
export function focusMail(s: MailDemoState, id: string, actualFolder?: MailFolder): MailDemoState {
  const folder: MailFolder = actualFolder ?? (s.sent.some((m) => m.id === id) ? "sent" : "inbox");
  const stash = s.compose && hasContent(s.compose) ? [...s.stash, { ...s.compose, ai: null }] : s.stash;
  return selectMail({ ...s, folder, query: "", compose: null, stash }, id);
}

export function startReply(s: MailDemoState, email: Email): MailDemoState {
  const compose: Compose = { mode: "reply", replyTo: email.id, to: email.from, toName: displayName(email.fromName), subject: reSubject(email.subject), body: "", invite: false, ai: null };
  return { ...selectMail(s, email.id), compose };
}

export function startNew(s: MailDemoState): MailDemoState {
  return { ...s, compose: { mode: "new", replyTo: null, to: "", toName: "", subject: "", body: "", invite: false, ai: null } };
}

export type ComposeField = "to" | "subject" | "body";

/** Any manual edit stops a running AI draft and keeps what is on screen. */
export function editCompose(s: MailDemoState, field: ComposeField, value: string): MailDemoState {
  if (!s.compose) return s;
  const next: Compose = { ...s.compose, [field]: value, ai: null };
  if (field === "to") next.toName = isAddress(value) ? nameFromAddress(value) : "";
  return { ...s, compose: next };
}

export function toggleInvite(s: MailDemoState): MailDemoState {
  return s.compose ? { ...s, compose: { ...s.compose, invite: !s.compose.invite } } : s;
}

const hasContent = (c: Compose) => !!(c.to.trim() || c.subject.trim() || c.body.trim());

/** Pops the newest stashed draft back into the editor (or closes it). */
const restoreStash = (s: MailDemoState): MailDemoState => ({ ...s, compose: s.stash.at(-1) ?? null, stash: s.stash.slice(0, -1) });

export function discardCompose(s: MailDemoState): MailDemoState {
  return restoreStash(s);
}

export type MailPrefill = { to: string; subject: string; body: string };

/** Opens a prefilled new mail; a draft with content is stashed instead of overwritten. */
export function prefillCompose(s: MailDemoState, d: MailPrefill): MailDemoState {
  const keep = s.compose && hasContent(s.compose) ? [...s.stash, { ...s.compose, ai: null }] : s.stash;
  const to = d.to.trim();
  const compose: Compose = { mode: "new", replyTo: null, to, toName: isAddress(to) ? nameFromAddress(to) : "", subject: d.subject, body: d.body, invite: false, ai: null };
  return { ...s, stash: keep, compose };
}

export function canSend(c: Compose | null): boolean {
  return !!c && isAddress(c.to) && c.body.trim().length > 0 && !c.ai;
}

export function sendCompose(s: MailDemoState, now = new Date()): MailDemoState {
  const c = s.compose;
  if (!c || !canSend(c)) return s;
  const mail: SentMail = {
    id: `S-${s.sent.length + 1}`,
    to: c.to.trim(),
    toName: c.toName || c.to.trim(),
    subject: c.subject.trim() || "(kein Betreff)",
    body: c.body.trim(),
    sentAt: isoLocal(now),
    inReplyTo: c.replyTo,
    invite: c.invite,
  };
  return { ...restoreStash(s), sent: [mail, ...s.sent], lastSent: { id: mail.id, toName: mail.toName, seq: (s.lastSent?.seq ?? 0) + 1 } };
}

export function startAiDraft(s: MailDemoState, email: Email | null, user = DEMO_USER): MailDemoState {
  if (!s.compose) return s;
  const text = aiDraftText(s.compose, email, user);
  return { ...s, compose: { ...s.compose, body: "", ai: { text, pos: 0 } } };
}

/** Advances the AI draft by up to `chars` characters; finishes it when the text is complete. */
export function typeTick(s: MailDemoState, chars: number): MailDemoState {
  const c = s.compose;
  if (!c?.ai) return s;
  const pos = Math.min(c.ai.text.length, c.ai.pos + chars);
  const body = c.ai.text.slice(0, pos);
  return { ...s, compose: { ...c, body, ai: pos >= c.ai.text.length ? null : { ...c.ai, pos } } };
}

export function stopTyping(s: MailDemoState): MailDemoState {
  return s.compose?.ai ? { ...s, compose: { ...s.compose, ai: null } } : s;
}

export const unreadCount = (s: Pick<MailDemoState, "read" | "sent">, emails: Email[]) =>
  emails.filter((e) => e.folder === "inbox" && e.unread && !s.read.includes(e.id) && !s.sent.some((m) => m.inReplyTo === e.id)).length;

// ---- what is on screen -----------------------------------------------------------------------

type ListState = Pick<MailDemoState, "folder" | "selectedId" | "sent" | "query">;

export type MailLists = {
  inbox: Email[];
  sentRows: SentMail[];
  inboxShown: Email[];
  sentShown: SentMail[];
  selInbox: Email | undefined;
  selSent: SentMail | undefined;
};

/** Lists and selection exactly as the interactive mailer renders them (newest first, search applied). */
export function mailLists(s: ListState, emails: Email[]): MailLists {
  const inbox = emails.filter((e) => e.folder === "inbox").sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const sentRows: SentMail[] = [
    ...s.sent,
    ...emails
      .filter((e) => e.folder === "sent")
      .map((e) => ({ id: e.id, to: e.to, toName: e.to, subject: e.subject, body: e.body, sentAt: e.receivedAt, inReplyTo: null, invite: false })),
  ];
  const q = s.query.trim().toLowerCase();
  const match = (...xs: string[]) => !q || xs.some((x) => x.toLowerCase().includes(q));
  const inboxShown = inbox.filter((e) => match(e.fromName, e.from, e.subject, e.body));
  const sentShown = sentRows.filter((m) => match(m.toName, m.to, m.subject, m.body));
  const selInbox = s.folder === "inbox" ? (inbox.find((e) => e.id === s.selectedId) ?? inboxShown[0]) : undefined;
  const selSent = s.folder === "sent" ? (sentRows.find((m) => m.id === s.selectedId) ?? sentShown[0]) : undefined;
  return { inbox, sentRows, inboxShown, sentShown, selInbox, selSent };
}

/** The mail in the reading pane as plain facts for Jarvis' context. */
export type VisibleMail = { draft?: boolean; id: string; folder: MailFolder; subject: string; body: string; fromName: string; from: string; to: string };

export function visibleMail(s: ListState & { compose?: Compose | null }, emails: Email[]): VisibleMail | null {
  if (s.compose) return { id: "draft", draft: true, folder: s.folder, subject: s.compose.subject, body: s.compose.body, fromName: DEMO_USER, from: DEMO_ACCOUNT, to: s.compose.to };
  const { selInbox, selSent } = mailLists(s, emails);
  if (selInbox) return { id: selInbox.id, folder: "inbox", subject: selInbox.subject, body: selInbox.body, fromName: displayName(selInbox.fromName), from: selInbox.from, to: selInbox.to };
  if (selSent) return { id: selSent.id, folder: "sent", subject: selSent.subject, body: selSent.body, fromName: DEMO_USER, from: DEMO_ACCOUNT, to: selSent.to };
  return null;
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The fixture mail a ui.focus means. The backend numbers mails differently (M-003, M-009), so an
 * unknown id falls back to the label: subject first, then a unique sender name. No match or an
 * ambiguous one returns null instead of guessing.
 */
export function resolveFocusMail(focus: { entityId: string; label: string }, emails: Email[]): string | null {
  if (emails.some((e) => e.id === focus.entityId)) return focus.entityId;
  const label = ` ${norm(focus.label)} `;
  if (!label.trim()) return null;
  const unique = (hits: Email[]) => (hits.length === 1 ? hits[0]!.id : null);
  const bySubject = emails.filter((e) => {
    const subj = norm(e.subject);
    return subj.length > 0 && (label.includes(` ${subj} `) || ` ${subj} `.includes(label));
  });
  if (bySubject.length) return unique(bySubject);
  const byName = emails.filter((e) => {
    const name = norm(displayName(e.fromName));
    const last = name.split(" ").at(-1) ?? "";
    return label.includes(` ${name} `) || (last.length >= 4 && label.includes(` ${last} `));
  });
  return unique(byName);
}

// ---- deterministic AI drafts ----------------------------------------------------------------

// Replies for the fixture story (demo/BEISPIEL-ABLAUF.md). They only promise what the mail asked for.
const REPLIES: Record<string, (user: string) => string> = {
  "M-101": (u) =>
    `Hallo Herr Müller,\n\nsehr gern, 15 Uhr passt uns. Ich schicke Ihnen gleich eine Einladung für den Call, den Vertrag bringen wir unterschriftsreif mit.\n\nViele Grüße\n${u}`,
  "M-102": (u) =>
    `Hallo Frau Dr. Weber,\n\ndas freut uns sehr, 38 Anrufe an einem Tag sind ein starker Start. Ich lege den Testtermin in PraxisPilot diese Woche an und melde mich mit der Bestätigung.\n\nHerzliche Grüße\n${u}`,
  "M-103": (u) =>
    `Hallo Frau Klein,\n\ndanke für die Terminvorschläge. Ich prüfe unseren Kalender und gebe Ihnen bis morgen Bescheid, welcher Termin im November für uns passt.\n\nBeste Grüße\n${u}`,
  "M-104": (u) => `Hallo zusammen,\n\ndanke für die Info, dann ist die Rechnung #2026-114 für mich erledigt.\n\nViele Grüße\n${u}`,
  "M-105": (u) =>
    `Hallo Herr Dr. Petersen,\n\ngern besprechen wir die beiden Punkte zur Datenhaltung. Ich schlage einen kurzen Call vor und schicke Ihnen dafür zwei Terminvorschläge.\n\nViele Grüße\n${u}`,
  "M-106": (u) => `Hi Jonas,\n\ndanke für den Plan, sieht gut aus. Gib Bescheid, falls du beim Update für Krämer Unterstützung brauchst.\n\nViele Grüße\n${u}`,
};

export function aiDraftText(c: Compose, email: Email | null, user = DEMO_USER): string {
  const fixed = email && c.replyTo === email.id ? REPLIES[email.id] : undefined;
  if (fixed) return fixed(user);
  const greeting = c.toName ? `Hallo ${c.toName},` : "Hallo,";
  if (email && c.replyTo === email.id) {
    return `${greeting}\n\nvielen Dank für Ihre Nachricht zu „${email.subject}“. Ich schaue mir das an und melde mich zeitnah mit einer Rückmeldung.\n\nViele Grüße\n${user}`;
  }
  const topic = c.subject.trim();
  const body = topic
    ? `ich melde mich wegen „${topic}“. Haben Sie diese Woche Zeit für ein kurzes Gespräch? Ich richte mich gern nach Ihrem Kalender.`
    : "ich würde gern kurz mit Ihnen sprechen. Haben Sie diese Woche Zeit für ein kurzes Gespräch? Ich richte mich gern nach Ihrem Kalender.";
  return `${greeting}\n\n${body}\n\nViele Grüße\n${user}`;
}

// ---- store ----------------------------------------------------------------------------------

type Actions = {
  select: (id: string) => void;
  focus: (id: string, folder?: MailFolder) => void;
  browseInbox: () => void;
  open: (folder: MailFolder) => void;
  search: (query: string) => void;
  prefill: (d: MailPrefill) => void;
  reply: (email: Email) => void;
  compose: () => void;
  edit: (field: ComposeField, value: string) => void;
  toggleInvite: () => void;
  discard: () => void;
  send: () => boolean;
  aiDraft: (email: Email | null) => void;
  tick: (chars: number) => void;
  stopTyping: () => void;
  reset: () => void;
};

export const useMailDemo = create<MailDemoState & { actions: Actions }>()((set, get) => {
  const apply = (f: (s: MailDemoState) => MailDemoState) => set((s) => f(s));
  return {
    ...initialMailDemo(),
    actions: {
      select: (id) => apply((s) => selectMail(s, id)),
      focus: (id, folder) => apply((s) => focusMail(s, id, folder)),
      browseInbox: () => apply(browseInbox),
      open: (folder) => apply((s) => openFolder(s, folder)),
      search: (query) => apply((s) => setQuery(s, query)),
      prefill: (d) => apply((s) => prefillCompose(s, d)),
      reply: (email) => apply((s) => startReply(s, email)),
      compose: () => apply(startNew),
      edit: (field, value) => apply((s) => editCompose(s, field, value)),
      toggleInvite: () => apply(toggleInvite),
      discard: () => apply(discardCompose),
      send: () => {
        const before = get().sent.length;
        apply((s) => sendCompose(s));
        return get().sent.length > before;
      },
      aiDraft: (email) => apply((s) => startAiDraft(s, email)),
      tick: (chars) => apply((s) => typeTick(s, chars)),
      stopTyping: () => apply(stopTyping),
      reset: () => set(initialMailDemo()),
    },
  };
});
