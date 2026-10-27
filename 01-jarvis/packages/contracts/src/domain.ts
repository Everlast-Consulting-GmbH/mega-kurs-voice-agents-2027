import { z } from "zod";

// Domain records served by services/mock-world (REST, JSON) and consumed by the
// orchestrator and the HUD. All timestamps are ISO-8601 strings in Europe/Berlin.

export const LeadStatus = z
  .enum(["neu", "qualifiziert", "angebot", "verhandlung", "gewonnen", "verloren"])
  .meta({ id: "LeadStatus" });

export const Lead = z
  .object({
    id: z.string(),
    name: z.string().describe("Contact person"),
    company: z.string(),
    email: z.string(),
    phone: z.string(),
    city: z.string(),
    lat: z.number(),
    lng: z.number(),
    status: LeadStatus,
    valueEur: z.number().int(),
    score: z.number().int().min(0).max(100),
    lastContactAt: z.string(),
    nextStep: z.string(),
    notes: z.string(),
  })
  .meta({ id: "Lead" });

export const Email = z
  .object({
    id: z.string(),
    from: z.string(),
    fromName: z.string(),
    to: z.string(),
    subject: z.string(),
    body: z.string(),
    receivedAt: z.string(),
    unread: z.boolean(),
    priority: z.enum(["low", "normal", "high"]),
    leadId: z.string().nullable(),
    folder: z.enum(["inbox", "sent"]),
  })
  .meta({ id: "Email" });

export const CalendarEvent = z
  .object({
    id: z.string(),
    title: z.string(),
    start: z.string(),
    end: z.string(),
    location: z.string(),
    attendees: z.array(z.string()),
    leadId: z.string().nullable(),
  })
  .meta({ id: "CalendarEvent" });

export const Patient = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    birthDate: z.string(),
    phone: z.string(),
    insurance: z.enum(["gesetzlich", "privat"]),
  })
  .meta({ id: "Patient" });

export const Appointment = z
  .object({
    id: z.string(),
    patientId: z.string(),
    practitioner: z.string(),
    start: z.string(),
    durationMin: z.number().int(),
    reason: z.string(),
    status: z.enum(["geplant", "bestaetigt", "abgesagt"]),
  })
  .meta({ id: "Appointment" });

export type Lead = z.infer<typeof Lead>;
export type Email = z.infer<typeof Email>;
export type CalendarEvent = z.infer<typeof CalendarEvent>;
export type Patient = z.infer<typeof Patient>;
export type Appointment = z.infer<typeof Appointment>;

export const ChatMessage = z
  .object({
    id: z.string(),
    channel: z.string().describe("Channel name without #, e.g. 'vertrieb'"),
    author: z.string(),
    text: z.string(),
    sentAt: z.string(),
    fromJarvis: z.boolean(),
  })
  .meta({ id: "ChatMessage" });

export type ChatMessage = z.infer<typeof ChatMessage>;
