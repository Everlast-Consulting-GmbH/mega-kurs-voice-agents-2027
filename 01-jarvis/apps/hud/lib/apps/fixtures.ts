import type { CalendarEvent, ChatMessage, Email, Lead } from "@jarvis/contracts";

// Demo data for the app windows when the mock world is not reachable (HUD development
// against tools/mock-events, evidence runs). Same story as demo/BEISPIEL-ABLAUF.md and the same
// ids the multi-agent mock scenario uses. Dates are relative to the current week so "heute"
// is always today. Live data from services/mock-world replaces this at runtime.

export const DEMO_USER = process.env.NEXT_PUBLIC_DEMO_USER_NAME || "Leo";

export type AppData = { emails: Email[]; events: CalendarEvent[]; leads: Lead[]; chat: Record<string, ChatMessage[]> };

const pad = (n: number) => String(n).padStart(2, "0");

/** Local ISO string with offset, like the mock world sends (Europe/Berlin). */
export function isoLocal(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

/** Monday 00:00 of the week `d` is in. */
export function weekStart(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export function demoData(now = new Date()): AppData {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mon = weekStart(now);
  const at = (base: Date, dayOffset: number, hh: number, mm = 0) => {
    const d = new Date(base);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hh, mm, 0, 0);
    return isoLocal(d);
  };
  const t = (hh: number, mm = 0) => at(today, 0, hh, mm);
  const wk = (day: number, hh: number, mm = 0) => at(mon, day, hh, mm);

  const leads: Lead[] = [
    lead("L-001", "Thomas Müller", "Müller GmbH", "München", 48.137, 11.575, "angebot", 84000, 92, "Unterschrift für KI-Telefonassistent", "Maschinenbau, 140 Mitarbeitende. Will den Telefonassistenten vor dem Winter live haben."),
    lead("L-002", "Dr. Jens Petersen", "Hansa Kliniken", "Hamburg", 53.551, 9.993, "angebot", 120000, 81, "Rückfragen zum Angebot klären", "Drei Standorte, Terminannahme und Befundauskunft."),
    lead("L-003", "Sarah Klein", "Brandt AG", "Stuttgart", 48.775, 9.182, "qualifiziert", 48000, 77, "Workshop-Termine Q4 abstimmen", "Interesse an internem Wissensassistenten."),
    lead("L-004", "Henrik Olsen", "Nordlicht Logistik", "Bremen", 53.079, 8.801, "qualifiziert", 31000, 64, "Use Cases priorisieren", "Disposition und Fahrerkommunikation."),
    lead("L-006", "Katrin Berger", "Kanzlei Berger & Partner", "Köln", 50.937, 6.96, "qualifiziert", 26000, 58, "Datenschutzfragen beantworten", "Mandantenanfragen vorsortieren."),
    lead("L-005", "Dr. Anna Weber", "Hausarztpraxis Weber", "München", 48.152, 11.546, "gewonnen", 18000, 95, "KI-Empfang testen", "Praxissystem PraxisPilot ohne API."),
    lead("L-007", "Markus Krämer", "Autohaus Krämer", "Nürnberg", 49.452, 11.077, "gewonnen", 22000, 88, "Go-live Werkstatt-Hotline", "Terminvergabe für die Werkstatt."),
    lead("L-008", "Julia Hofmann", "Bäckerei Hofmann", "Regensburg", 49.013, 12.101, "gewonnen", 9500, 72, "Filial-Bestellungen per Telefon", "Sechs Filialen."),
    lead("L-009", "Peter Lindner", "Steuerbüro Lindner", "Augsburg", 48.371, 10.898, "gewonnen", 14000, 70, "Belegeingang automatisieren", "Kanzlei mit zwölf Mitarbeitenden."),
    lead("L-010", "Lena Schuster", "Stadtwerke Innland", "Rosenheim", 47.857, 12.118, "neu", 56000, 49, "Erstgespräch vereinbaren", "Störungshotline entlasten."),
  ];

  const emails: Email[] = [
    mail("M-101", "t.mueller@mueller-gmbh.example", "Thomas Müller", "Unterschrift heute möglich?",
      `Hallo ${DEMO_USER},\n\nwir sind intern durch und haben grünes Licht von der Geschäftsführung. Wenn ihr heute um 15 Uhr könnt, unterschreiben wir direkt im Call.\n\nViele Grüße\nThomas Müller\nEinkauf · Müller GmbH`,
      isoLocal(new Date(now.getTime() - 3 * 60_000)), true, "high", "L-001"),
    mail("M-102", "praxis@hausarzt-weber.example", "Dr. Anna Weber", "KI-Empfang: erste Eindrücke",
      `Hallo ${DEMO_USER},\n\ndas Team ist begeistert, gestern hat der Empfang 38 Anrufe allein beantwortet. Können wir diese Woche einen Testtermin in PraxisPilot anlegen?\n\nHerzliche Grüße\nAnna Weber`,
      t(8, 31), true, "high", "L-005"),
    mail("M-103", "s.klein@brandt-ag.example", "Sarah Klein · Brandt AG", "Workshop-Termine Q4",
      `Hallo ${DEMO_USER},\n\nfür den Workshop hätten wir drei Termine im November. Passt euch einer davon?\n\nBeste Grüße\nSarah Klein`,
      at(today, -1, 17, 40), false, "normal", "L-003"),
    mail("M-104", "buchhaltung@leos-agentur.example", "Finanzen", "Rechnung #2026-114",
      "Die Rechnung für die Hausarztpraxis Weber ist bezahlt und verbucht.", at(today, -1, 15, 5), false, "low", null),
    mail("M-105", "j.petersen@hansa-kliniken.example", "Dr. Jens Petersen", "Rückfragen zum Angebot",
      `Hallo ${DEMO_USER},\n\nzwei Punkte zur Datenhaltung würden wir gern noch besprechen, bevor wir weitergehen.\n\nGruß\nJens Petersen`,
      at(today, -3, 11, 20), false, "normal", "L-002"),
    mail("M-106", "jonas@leos-agentur.example", "Jonas", "Delivery-Plan KW " + isoWeek(now),
      "Anbei der Plan für diese Woche. Weber-Go-live steht, Autohaus Krämer bekommt Mittwoch das Update.", at(today, -3, 9, 10), false, "normal", null),
  ];

  const events: CalendarEvent[] = [
    ev("E-201", "Team-Standup", t(9, 30), t(10, 0), "Büro", ["Mara", "Jonas"]),
    ev("E-202", "Dr. Weber · Onboarding KI-Empfang", t(11, 0), t(12, 0), "Hausarztpraxis Weber", ["Dr. Anna Weber"], "L-005"),
    ev("E-203", "Angebotsrunde Nordlicht", t(16, 30), t(17, 15), "Videokonferenz", ["Henrik Olsen"], "L-004"),
    ev("E-204", "Hansa Kliniken · Rückfragen", wk(1, 10, 0), wk(1, 11, 0), "Videokonferenz", ["Dr. Jens Petersen"], "L-002"),
    ev("E-205", "Workshop Brandt AG", wk(2, 13, 0), wk(2, 15, 30), "Stuttgart", ["Sarah Klein"], "L-003"),
    ev("E-206", "Team-Standup", wk(3, 9, 30), wk(3, 10, 0), "Büro", ["Mara", "Jonas"]),
    ev("E-207", "Go-live Autohaus Krämer", wk(3, 14, 0), wk(3, 15, 0), "Nürnberg", ["Markus Krämer"], "L-007"),
    ev("E-208", "Review Q4", wk(4, 14, 0), wk(4, 15, 30), "Büro", ["Mara", "Jonas"]),
  ];

  const chat: Record<string, ChatMessage[]> = {
    allgemein: [
      msg("C-301", "allgemein", DEMO_USER, "Guten Morgen zusammen! Heute ist ein guter Tag für Unterschriften.", t(8, 2)),
      msg("C-302", "allgemein", "Jonas", "Kaffee ist frisch. Weber-Go-live lief übers Wochenende ohne Ausfälle.", t(8, 15)),
    ],
    vertrieb: [
      msg("C-311", "vertrieb", "Mara", "Hansa will bis Freitag eine zweite Runde zum Angebot.", at(today, -3, 16, 40)),
      msg("C-312", "vertrieb", "Mara", "Hat Müller sich schon gemeldet?", t(9, 12)),
    ],
    delivery: [
      msg("C-321", "delivery", "Jonas", "Autohaus Krämer: Update geht Mittwoch raus, Tests sind grün.", at(today, -1, 18, 3)),
    ],
  };

  return { emails, events, leads, chat };
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}
export { isoWeek };

function lead(id: string, name: string, company: string, city: string, lat: number, lng: number, status: Lead["status"], valueEur: number, score: number, nextStep: string, notes: string): Lead {
  const slug = company.toLowerCase().replace(/[^a-zäöüß]+/g, "-").replace(/(^-|-$)/g, "");
  return { id, name, company, email: `kontakt@${slug}.example`, phone: "+49 30 23125000", city, lat, lng, status, valueEur, score, lastContactAt: isoLocal(new Date()), nextStep, notes };
}

function mail(id: string, from: string, fromName: string, subject: string, body: string, receivedAt: string, unread: boolean, priority: Email["priority"], leadId: string | null): Email {
  return { id, from, fromName, to: `${DEMO_USER.toLowerCase()}@leos-agentur.example`, subject, body, receivedAt, unread, priority, leadId, folder: "inbox" };
}

function ev(id: string, title: string, start: string, end: string, location: string, attendees: string[], leadId: string | null = null): CalendarEvent {
  return { id, title, start, end, location, attendees, leadId };
}

function msg(id: string, channel: string, author: string, text: string, sentAt: string): ChatMessage {
  return { id, channel, author, text, sentAt, fromJarvis: false };
}
