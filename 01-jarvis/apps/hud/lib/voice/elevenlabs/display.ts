import { CalendarEvent, ChatMessage, Email, Lead, makeEvent, safeParseEvent, type JarvisEvent } from "@jarvis/contracts";
import { useUi } from "@/lib/ui";
import { desktopDisplayAllowed } from "@/lib/apps/desktop";
import { useHud } from "@/lib/events/store";
import { runPhase } from "@/lib/agents";
import { useAppData } from "@/lib/apps/data";

/** HTTP success can arrive even when the WebSocket focus frame was missed. */
export function toolDisplayEvent(name: string, params: Record<string, unknown>, body: unknown): JarvisEvent | null {
  if (!body || typeof body !== "object" || !("ok" in body) || body.ok !== true || !("result" in body)) return null;
  const value = body.result;
  if (name === "focus_entity") {
    const event = safeParseEvent(makeEvent("ui.focus", params as never));
    return event.success ? event.data : null;
  }
  if (["read_email", "reply_email", "send_email"].includes(name)) {
    const email = Email.safeParse(value);
    if (!email.success) return null;
    if (canHydrate()) useAppData.setState((s) => ({ emails: [email.data, ...s.emails.filter((m) => m.id !== email.data.id)] }));
    return makeEvent("ui.focus", { entity: "mail", entityId: email.data.id, label: email.data.subject });
  }
  if (["get_lead", "move_deal"].includes(name)) {
    const lead = Lead.safeParse(value);
    if (!lead.success) return null;
    if (canHydrate()) useAppData.setState((s) => ({ leads: [lead.data, ...s.leads.filter((l) => l.id !== lead.data.id)] }));
    return makeEvent("ui.focus", { entity: "lead", entityId: lead.data.id, label: lead.data.company });
  }
  if (name === "post_message") {
    const message = ChatMessage.safeParse(value);
    if (!message.success) return null;
    if (canHydrate()) useAppData.setState((s) => ({ chat: { ...s.chat, [message.data.channel]: merge([message.data], s.chat[message.data.channel] ?? []) } }));
    if (desktopDisplayAllowed(useHud.getState())) useUi.getState().openApp("chat", message.data.channel);
    return null;
  }
  if (name === "create_event") {
    const event = CalendarEvent.safeParse(value);
    if (!event.success) return null;
    if (canHydrate()) useAppData.setState((s) => ({ events: [event.data, ...s.events.filter((e) => e.id !== event.data.id)] }));
    return makeEvent("ui.focus", { entity: "event", entityId: event.data.id, label: event.data.title });
  }
  if (name === "list_emails") {
    const records = Email.array().safeParse(value);
    if (!records.success) return null;
    if (canHydrate()) useAppData.setState((s) => ({ emails: merge(records.data, s.emails) }));
    return records.data[0] ? makeEvent("ui.focus", { entity: "mail", entityId: records.data[0].id, label: records.data[0].subject }) : null;
  }
  if (name === "list_leads") {
    const records = Lead.array().safeParse(value);
    if (!records.success) return null;
    if (canHydrate()) useAppData.setState((s) => ({ leads: merge(records.data, s.leads) }));
    return records.data[0] ? makeEvent("ui.focus", { entity: "lead", entityId: records.data[0].id, label: records.data[0].company }) : null;
  }
  if (name === "list_events") {
    const records = CalendarEvent.array().safeParse(value);
    if (!records.success) return null;
    if (canHydrate()) useAppData.setState((s) => ({ events: merge(records.data, s.events) }));
    return records.data[0] ? makeEvent("ui.focus", { entity: "event", entityId: records.data[0].id, label: records.data[0].title }) : null;
  }
  return null;
}

/** Filtered reads must retain records from other folders or days. */
function merge<T extends { id: string }>(fresh: T[], existing: T[]): T[] {
  return [...fresh, ...existing.filter((old) => !fresh.some((item) => item.id === old.id))];
}

/** Completed playback may keep a cosmetic freeze; a new explicit tool result is authoritative. */
function canHydrate(): boolean {
  const state = useHud.getState();
  return !useAppData.getState().frozen || (!!state.run?.summary && runPhase(state, Date.now()) !== "work");
}
