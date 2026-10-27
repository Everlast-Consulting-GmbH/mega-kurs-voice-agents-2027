import type { JarvisEvent } from "@jarvis/contracts";
import { useHud, onHudEvent } from "@/lib/events/store";
import { useUi } from "@/lib/ui";
import { useAppData } from "./data";
import { desktopContext, desktopEvent, APP_NAMES } from "./desktop";
import { desktopCommand, mailReadingRequest } from "./commands";
import { resolveFocusMail, useMailDemo, visibleMail } from "./mailDemo";
import { useCrmDemo, withOverrides } from "./crmDemo";
import { stageItem } from "@/lib/stage";

/** One event boundary used by streamed events, SDK transcripts and local tool acknowledgements. */
export function applyDesktopEvent(event: JarvisEvent): string | null {
  const state = useHud.getState();
  const data = useAppData.getState();
  const ui = useUi.getState();
  const decision = desktopEvent(event, state, data.leads);
  if (decision === "close") {
    const item = stageItem(state, Date.now());
    const sticky = item?.kind === "cu" || item?.kind === "run" || (item?.kind === "approval" && item.approval.status === "pending");
    ui.closeApp(event.type === "transcript.final" && !sticky ? item?.key : undefined);
    return event.type === "transcript.final" ? "HUD: Das App-Fenster wurde geschlossen." : null;
  }
  if (decision && event.type === "tool.finished" && ui.workspace && (ui.workspace.app === decision.app || (decision.app === "crm" && ui.workspace.app === "offer"))) return null;
  if (!decision) {
    if (event.type === "transcript.final" && event.payload.role === "user" && desktopCommand(event.payload.text, data.leads)) {
      return "HUD: Das Fenster wurde nicht geöffnet. Die laufende Freigabe, Computerbedienung oder der aktive Agentenlauf behält die Bühne. Behaupte nicht, das Fenster sei offen.";
    }
    return null;
  }
  if (decision.app === "mail" && event.type === "transcript.final" && event.payload.role === "user" && mailReadingRequest(event.payload.text)) useMailDemo.getState().actions.browseInbox();
  if (decision.app === "mail" && event.type === "tool.finished" && event.payload.tool === "list_emails") useMailDemo.getState().actions.browseInbox();
  if (decision.app === "mail" && event.type === "ui.focus") {
    const id = resolveFocusMail(event.payload, data.emails);
    if (!id) return "HUD: Die angefragte Mail ist noch nicht geladen. Kein anderes Mail-Fenster wurde als Treffer geöffnet.";
    useMailDemo.getState().actions.focus(id, data.emails.find((mail) => mail.id === id)?.folder);
    decision.entityId = id;
  }
  if (ui.workspace?.app !== decision.app || ui.workspace?.entityId !== decision.entityId) ui.openApp(decision.app, decision.entityId);
  const mail = visibleMail(useMailDemo.getState(), data.emails);
  return `HUD: ${APP_NAMES[decision.app]} wurde tatsächlich geöffnet. ${desktopContext(decision, { ...data, leads: withOverrides(data.leads, useCrmDemo.getState().state) }, mail)}`;
}

export function listenForDesktopNavigation(notify: (context: string) => void = () => {}) {
  return onHudEvent((event) => {
    const context = applyDesktopEvent(event);
    if (context) notify(context);
  });
}
