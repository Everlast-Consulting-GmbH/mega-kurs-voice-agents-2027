import { z } from "zod";
import { EntityKind } from "./events.js";

// Tools exposed by the orchestrator's Tool-Gateway. The same list is served
// over HTTP (POST /tools/:name) for the ElevenLabs client tools in the HUD and over
// MCP (/mcp) for any other client. Keeping all capabilities here is what
// makes the voice layer swappable.
//
// latency "fast": answers synchronously in <= 300 ms.
// latency "async": returns { taskId } immediately; progress arrives as task.* events.

export const Dataset = z
  .enum(["pipeline_by_month", "leads_by_status", "leads_by_city", "emails_by_day"])
  .meta({ id: "Dataset" });

export const ToolInputs = {
  get_briefing: z.object({}),
  list_leads: z.object({
    status: z
      .enum(["neu", "qualifiziert", "angebot", "verhandlung", "gewonnen", "verloren"])
      .optional()
      .describe("Nur Leads mit diesem Status; weglassen für alle"),
    limit: z.number().int().min(1).max(50).optional().describe("Maximale Anzahl Leads, Standard 10"),
  }),
  get_lead: z.object({ leadId: z.string().describe("Lead-ID aus list_leads, z. B. L-007") }),
  list_emails: z.object({
    unreadOnly: z.boolean().optional().describe("Nur ungelesene Mails"),
    limit: z.number().int().min(1).max(50).optional().describe("Maximale Anzahl Mails, Standard 10"),
  }),
  read_email: z.object({ emailId: z.string().describe("Mail-ID aus list_emails, z. B. M-003") }),
  list_events: z.object({ date: z.string().optional().describe("Tag im Format YYYY-MM-DD, Standard heute") }),
  focus_entity: z.object({
    entity: EntityKind.describe("Art der Kachel: lead, mail, event, task, patient oder appointment"),
    entityId: z.string().describe("Echte ID aus dem Tool-Ergebnis"),
    label: z.string().describe("Kurzer Anzeigename, z. B. Müller GmbH"),
  }),
  render_widget: z.object({
    dataset: Dataset.describe("Fester Datensatz, der angezeigt werden soll"),
    kind: z
      .enum(["bar_chart", "line_chart", "table", "map", "stat"])
      .optional()
      .describe("Darstellung; weglassen für die passende Standardform"),
    title: z.string().optional().describe("Optionaler Titel der Anzeige"),
  }),
  delegate_task: z.object({ instruction: z.string().describe("Vollständige Aufgabe auf Deutsch mit allem nötigen Kontext") }),
  start_computer_task: z.object({
    instruction: z.string().describe("Was auf dem Bildschirm erledigt werden soll, auf Deutsch, mit allen Details"),
    mode: z.enum(["pixel", "assisted"]).optional().describe("Ausführungsmodus; weglassen für den Standard"),
  }),
  send_email: z.object({
    to: z.string().describe("Empfänger-Mailadresse aus den Daten"),
    subject: z.string().describe("Betreff der Mail"),
    body: z.string().describe("Text der Mail auf Deutsch"),
  }),
  create_event: z.object({
    title: z.string().describe("Titel des Termins"),
    start: z.string().describe("Beginn als ISO-Zeitpunkt, z. B. 2026-10-13T10:00:00+02:00"),
    end: z.string().describe("Ende als ISO-Zeitpunkt"),
    attendees: z.array(z.string().describe("Mailadresse eines Teilnehmers")).optional().describe("Mailadressen der Teilnehmer"),
    leadId: z.string().optional().describe("Zugehörige Lead-ID, falls vorhanden"),
  }),
  place_call: z.object({
    to: z.string().describe('"me" für Leo, sonst eine Nummer im E.164-Format'),
    purpose: z.string().describe("Worum es im Anruf geht, ein Satz"),
  }),
  reply_email: z.object({
    emailId: z.string().describe("ID der Mail, auf die geantwortet wird"),
    body: z.string().describe("Antworttext auf Deutsch"),
  }),
  post_message: z.object({
    channel: z.string().describe("Team-Kanal ohne #, z. B. vertrieb"),
    text: z.string().describe("Nachricht auf Deutsch"),
  }),
  move_deal: z.object({
    leadId: z.string().describe("Lead-ID, z. B. L-007"),
    status: z
      .enum(["neu", "qualifiziert", "angebot", "verhandlung", "gewonnen", "verloren"])
      .describe("Neue Pipeline-Phase"),
  }),
  handle_request: z.object({
    instruction: z
      .string()
      .describe("Mehrteiliger Auftrag über mehrere Programme, z. B. 'Kümmer dich um die Müller GmbH'"),
  }),
  resolve_approval: z.object({
    approvalId: z.string().describe("ID der offenen Freigabe aus dem HUD-Hinweis"),
    approved: z.boolean().describe("true bei ausdrücklichem Ja, false bei Nein"),
  }),
} as const;

export type ToolName = keyof typeof ToolInputs;
export type ToolInput<N extends ToolName> = z.infer<(typeof ToolInputs)[N]>;

export const TOOL_META: Record<ToolName, { latency: "fast" | "async"; description: string; needsApproval?: boolean }> = {
  get_briefing: { latency: "fast", description: "Vorberechnetes Tagesbriefing: Termine, wichtige Mails, Leads, Kennzahlen." },
  list_leads: { latency: "fast", description: "Leads aus dem CRM, sortiert nach Score." },
  get_lead: { latency: "fast", description: "Details zu einem Lead." },
  list_emails: { latency: "fast", description: "Posteingang, neueste zuerst." },
  read_email: { latency: "fast", description: "Eine Mail vollständig lesen." },
  list_events: { latency: "fast", description: "Kalendertermine eines Tages." },
  focus_entity: { latency: "fast", description: "Hebt eine Kachel im Dashboard hervor, über die gerade gesprochen wird." },
  render_widget: { latency: "fast", description: "Zeigt ein Diagramm/Tabelle/Karte im Dashboard aus einem festen Datensatz." },
  delegate_task: { latency: "async", description: "Mehrschrittige Aufgabe an den Orchestrator (Claude) übergeben." },
  start_computer_task: { latency: "async", description: "Aufgabe per Computer Use auf dem Agent-Bildschirm ausführen." },
  send_email: { latency: "async", description: "Mail senden (verlangt Freigabe).", needsApproval: true },
  create_event: { latency: "fast", description: "Kalendertermin anlegen." },
  place_call: { latency: "async", description: "Ausgehenden Anruf starten." },
  resolve_approval: { latency: "fast", description: "Offene Freigabe annehmen oder ablehnen (per Stimme)." },
  reply_email: { latency: "fast", description: "Auf eine Mail antworten; die Antwort landet im Gesendet-Ordner." },
  post_message: { latency: "fast", description: "Nachricht in einen Team-Kanal posten." },
  move_deal: { latency: "fast", description: "Deal im CRM in eine andere Pipeline-Phase verschieben." },
  handle_request: {
    latency: "async",
    description:
      "Mehrteiliger Auftrag: mehrere Agenten arbeiten parallel und sichtbar in Mail, Kalender, Chat und CRM. Für alles, was mehrere Programme betrifft.",
    needsApproval: true,
  },
};

export const ToolResult = z
  .object({ ok: z.boolean(), result: z.unknown().optional(), error: z.string().optional() })
  .meta({ id: "ToolResult" });
export type ToolResult = z.infer<typeof ToolResult>;

export const AsyncAccepted = z.object({ taskId: z.string() }).meta({ id: "AsyncAccepted" });
