import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent } from "@jarvis/contracts";
import { ElevenLabsVoiceSession, type ConversationControls } from "@/lib/voice/ElevenLabsVoiceSession";
import { createClientTools } from "@/lib/voice/elevenlabs/tools";
import { applyLocalEvent, useHud } from "@/lib/events/store";
import { listenForDesktopNavigation } from "@/lib/apps/navigation";
import { useUi } from "@/lib/ui";
import { useAppData } from "@/lib/apps/data";
import { demoData } from "@/lib/apps/fixtures";
import { useMailDemo } from "@/lib/apps/mailDemo";

let session: ElevenLabsVoiceSession;
let stop: () => void;
let context: ReturnType<typeof vi.fn>;
const speak = (message: string, role: "user" | "agent" = "user") => session.onMessage({ message, role, event_id: Date.now() });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  useHud.getState().reset();
  useAppData.setState({ ...demoData(), frozen: false });
  session = new ElevenLabsVoiceSession();
  context = vi.fn();
  session.attach({ sendContextualUpdate: context, getInputVolume: () => 0, getOutputVolume: () => 0 } as unknown as ConversationControls);
  session.onStatus("connected");
  stop = listenForDesktopNavigation((text) => session.updateContext(text));
});
afterEach(() => { stop(); session.onStatus("disconnected"); session.attach(null); vi.useRealTimers(); });

describe("actual SDK transcript to window navigation", () => {
  it.each([["Öffne mein CRM", "crm"], ["Mach die Mails auf", "mail"], ["Zeig das Angebot für Müller", "offer"], ["Öffne den Kalender", "calendar"]])("%s opens the app and confirms its actual state to the voice agent", (text, app) => {
    speak(text);
    expect(useUi.getState().workspace?.app).toBe(app);
    expect(context.mock.calls.at(-1)?.[0]).toContain("tatsächlich geöffnet");
  });
  it.each(["Welche Mails habe ich?", "Habe ich neue E-Mails?", "Was steht in meinem Posteingang?", "Wie viele Mails habe ich?", "Lies mir meine Mails vor"])("%s reveals the inbox without an explicit open command", (text) => {
    speak(text);
    expect(useUi.getState().workspace?.app).toBe("mail");
    expect(context.mock.calls.at(-1)?.[0]).toContain("tatsächlich geöffnet");
  });
  it("a reading question reveals the inbox instead of a saved draft or sent folder", () => {
    const actions = useMailDemo.getState().actions;
    actions.open("sent");
    actions.prefill({ to: "demo@example.com", subject: "Entwurf", body: "Behalten" });
    speak("Welche Mails habe ich?");
    expect(useMailDemo.getState().folder).toBe("inbox");
    expect(useMailDemo.getState().compose).toBeNull();
    expect(useMailDemo.getState().stash.at(-1)?.body).toBe("Behalten");
  });
  it("an explicit new command replaces an old widget, then closes the window", () => {
    applyLocalEvent(makeEvent("ui.widget", { widgetId: "old", kind: "bar_chart", title: "Pipeline", data: [{ label: "A", value: 1 }] }));
    expect(useUi.getState().hiddenStageKey).toBeNull();
    vi.advanceTimersByTime(1000);
    speak("Öffne bitte mein CRM");
    expect(useUi.getState().workspace?.app).toBe("crm");
    speak("Schließe das CRM-Fenster");
    expect(useUi.getState().workspace).toBeNull();
    expect(useUi.getState().hiddenStageKey).toBe("widget-old");
  });
  it("does not interpret assistant output, negation or an unknown company as an app command", () => {
    speak("Öffne CRM", "agent");
    speak("Öffne bitte nicht das CRM");
    speak("Wie öffne ich das CRM?");
    speak("Wie kann ich meine Mails öffnen?");
    speak("Schreibe eine Mail an Müller");
    speak("Welche Mails kann ich versenden?");
    speak("Zeig ein Diagramm der Pipeline");
    speak("Zeig das Angebot für die unbekannte Schmidt AG");
    expect(useUi.getState().workspace).toBeNull();
  });
  it("protects a pending approval and informs the voice agent that nothing opened", () => {
    applyLocalEvent(makeEvent("approval.requested", { approvalId: "a", title: "Mail senden?", detail: "Freigabe", risk: "medium" }));
    speak("Welche Mails habe ich?");
    expect(useUi.getState().workspace).toBeNull();
    expect(context.mock.calls.at(-1)?.[0]).toContain("nicht geöffnet");
    expect(useHud.getState().approvals.a?.status).toBe("pending");
  });
});

describe("tool result to display without WebSocket delivery", () => {
  it("opens a newly read backend mail after a successful HTTP response", async () => {
    const email = { ...demoData().emails[0]!, id: "M-BACKEND", subject: "Aktuelle Mail vom Backend" };
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: email }), {status:200}));
    useMailDemo.getState().actions.prefill({ to: "demo@example.com", subject: "Mein Entwurf", body: "Bitte behalten" });
    const tools = createClientTools({ fetch });
    await tools.read_email!({ emailId: email.id });
    expect(useUi.getState().workspace).toEqual({ app: "mail", entityId: email.id });
    expect(useMailDemo.getState().selectedId).toBe(email.id);
    expect(useMailDemo.getState().compose).toBeNull();
    expect(useMailDemo.getState().stash.at(-1)?.body).toBe("Bitte behalten");
    useMailDemo.getState().actions.discard();
    expect(useMailDemo.getState().compose?.body).toBe("Bitte behalten");
    expect(useAppData.getState().emails.find((m) => m.id === email.id)?.subject).toBe(email.subject);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("opens the offer from the real returned lead and the user's current request", async () => {
    const lead = { ...demoData().leads[0]!, id: "L-BACKEND", company: "Neue Firma GmbH" };
    speak("Was kostet das Angebot der neuen Firma?");
    const tools = createClientTools({ fetch: async () => new Response(JSON.stringify({ok:true,result:lead}), {status:200}) });
    await tools.get_lead!({ leadId: lead.id });
    expect(useUi.getState().workspace).toEqual({app:"offer",entityId:lead.id});
    expect(useAppData.getState().leads.find((l) => l.id === lead.id)?.company).toBe(lead.company);
  });
  it("does not claim a failed gateway operation opened an app", async () => {
    const tools = createClientTools({ fetch: async () => new Response(JSON.stringify({ok:false,error:"Nicht gefunden"}), {status:200}) });
    const result = JSON.parse(await tools.focus_entity!({entity:"lead",entityId:"L-X",label:"Angebot"}));
    expect(result.ok).toBe(false);
    expect(useUi.getState().workspace).toBeNull();
  });
});

it("reveals the actual sent reply without a second focus tool", async () => {
  const sent = { ...demoData().emails[0]!, id: "M-SENT", folder: "sent", unread: false, body: "Antwort von Leo" };
  const tools = createClientTools({ fetch: async () => new Response(JSON.stringify({ok:true,result:sent})) });
  await tools.reply_email!({emailId:"M-001",body:sent.body});
  expect(useUi.getState().workspace).toEqual({app:"mail",entityId:sent.id});
  expect(useMailDemo.getState().folder).toBe("sent");
  expect(useMailDemo.getState().selectedId).toBe(sent.id);
});

it.each([["list_emails", "mail", "emails"], ["list_leads", "crm", "leads"], ["list_events", "calendar", "events"]] as const)("%s reveals its actual records without a focus tool", async (name, app, collection) => {
  const result = demoData()[collection];
  const tools = createClientTools({ fetch: async () => new Response(JSON.stringify({ok:true,result})) });
  await tools[name]!({});
  expect(useUi.getState().workspace?.app).toBe(app);
});

it("a late streamed completion preserves the precise offer opened by HTTP", async () => {
  speak("Was kostet das Angebot von Müller?");
  const lead = demoData().leads[0]!;
  const tools = createClientTools({ fetch: async () => new Response(JSON.stringify({ok:true,result:lead})) });
  await tools.get_lead!({leadId:lead.id});
  applyLocalEvent(makeEvent("tool.finished", {callId:"late",tool:"get_lead",ok:true,summary:"Geladen",durationMs:1}));
  expect(useUi.getState().workspace).toEqual({app:"offer",entityId:lead.id});
});

it("a late streamed list completion preserves a sent-folder selection", async () => {
  const sent = { ...demoData().emails[0]!, id: "M-SENT-LIST", folder: "sent", unread: false };
  const tools = createClientTools({ fetch: async () => new Response(JSON.stringify({ok:true,result:[sent]})) });
  await tools.list_emails!({folder:"sent"});
  applyLocalEvent(makeEvent("tool.finished", {callId:"late",tool:"list_emails",ok:true,summary:"Geladen",durationMs:1}));
  expect(useUi.getState().workspace).toEqual({app:"mail",entityId:sent.id});
  expect(useMailDemo.getState().folder).toBe("sent");
  expect(useMailDemo.getState().selectedId).toBe(sent.id);
});

it("a new reply following a completed run hydrates despite the summary freeze", async () => {
  useAppData.setState({frozen:true});
  applyLocalEvent(makeEvent("run.planned", {runId:"done",title:"Fertig",steps:[]}));
  applyLocalEvent(makeEvent("run.summary", {runId:"done",title:"Fertig",tasks:1,durationMs:100,humanMinutes:1}));
  vi.advanceTimersByTime(1000);
  speak("Beantworte die erste Mail");
  const sent = { ...demoData().emails[0]!, id:"M-AFTER-RUN",folder:"sent",unread:false };
  const tools = createClientTools({ fetch: async () => new Response(JSON.stringify({ok:true,result:sent})) });
  await tools.reply_email!({emailId:"M-001",body:"Danke"});
  expect(useUi.getState().workspace).toEqual({app:"mail",entityId:sent.id});
});

it("HTTP focus wins when the streamed completion arrives first", async () => {
  applyLocalEvent(makeEvent("tool.finished", {callId:"early",tool:"reply_email",ok:true,summary:"Gesendet",durationMs:1}));
  const sent = { ...demoData().emails[0]!, id:"M-EARLY",folder:"sent",unread:false };
  const tools = createClientTools({fetch:async()=>new Response(JSON.stringify({ok:true,result:sent}))});
  await tools.reply_email!({emailId:"M-001",body:"Danke"});
  expect(useUi.getState().workspace).toEqual({app:"mail",entityId:sent.id});
  expect(useMailDemo.getState().folder).toBe("sent");
});

it("does not cover approval with a successful background read", async () => {
  applyLocalEvent(makeEvent("approval.requested",{approvalId:"stay",title:"Freigeben?",detail:"Plan",risk:"medium"}));
  applyLocalEvent(makeEvent("tool.finished",{callId:"read",tool:"list_emails",ok:true,summary:"Geladen",durationMs:1}));
  const tools = createClientTools({fetch:async()=>new Response(JSON.stringify({ok:true,result:demoData().emails}))});
  await tools.list_emails!({});
  expect(useUi.getState().workspace).toBeNull();
  expect(useHud.getState().approvals.stay?.status).toBe("pending");
});

it("reveals the actual posted team message even without an agent run", async () => {
  const message={id:"CHAT-REAL",channel:"delivery",author:"Jarvis",text:"Angebot geprüft",sentAt:"2026-10-15T12:00:00+02:00",fromJarvis:true};
  const tools=createClientTools({fetch:async()=>new Response(JSON.stringify({ok:true,result:message}))});
  await tools.post_message!({channel:"delivery",text:message.text});
  expect(useUi.getState().workspace).toEqual({app:"chat",entityId:"delivery"});
  expect(useAppData.getState().chat.delivery?.some((m)=>m.id===message.id)).toBe(true);
});
