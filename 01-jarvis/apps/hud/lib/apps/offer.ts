import type { Lead } from "@jarvis/contracts";
import type { Focus, HudState } from "@/lib/events/reducer";
import { focusFacts } from "@/lib/stage";

// A demo offer document derived only from a lead record: the net total is exactly the lead's
// valueEur, split over fixed work packages. Nothing is fetched, sent or legally binding.

export const VAT_RATE = 0.19;
export const VALID_DAYS = 30;
export const DEMO_NOTE = "Demo-Entwurf auf Testdaten · kein verbindliches Angebot · wird nicht versendet";

export type OfferLine = { pos: number; title: string; detail: string; weeks: string; amountEur: number };
export type OfferPhase = { label: string; weeks: string; from: number; to: number };

export type Offer = {
  number: string;
  title: string;
  issuedAt: string;
  validUntil: string;
  recipient: { company: string; name: string; email: string; city: string };
  situation: string;
  goal: string;
  lines: OfferLine[];
  phases: OfferPhase[];
  totalWeeks: number;
  netEur: number;
  vatEur: number;
  grossEur: number;
  terms: string[];
};

// Work packages: share of the net total and the weeks they cover. The last one takes the rest,
// so the lines always add up to valueEur to the euro.
const PACKAGES = [
  { title: "Analyse & Konzeption", detail: "Workshop, Gesprächsleitfäden, Datenschutz-Check", share: 0.15, from: 1, to: 2 },
  { title: "Umsetzung KI-Assistent", detail: "Sprachdialog, Wissensbasis, deutsche Stimme", share: 0.45, from: 3, to: 6 },
  { title: "Integration", detail: "Anbindung an CRM, Kalender und Mail", share: 0.2, from: 5, to: 8 },
  { title: "Test & Schulung", detail: "Probeläufe mit echten Abläufen, Team-Schulung", share: 0.1, from: 9, to: 9 },
  { title: "Go-live & Begleitung", detail: "Start, vier Wochen Feinschliff und Auswertung", share: 0.1, from: 10, to: 13 },
] as const;

const weeks = (from: number, to: number) => (from === to ? `Woche ${from}` : `Woche ${from}–${to}`);
const dateDe = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Net amounts per package, rounded to 100 €, the remainder on the last line. */
export function splitAmount(totalEur: number): number[] {
  const parts = PACKAGES.slice(0, -1).map((p) => Math.round((totalEur * p.share) / 100) * 100);
  return [...parts, totalEur - parts.reduce((a, b) => a + b, 0)];
}

export function buildOffer(lead: Lead, today = new Date()): Offer {
  const amounts = splitAmount(lead.valueEur);
  const valid = new Date(today);
  valid.setDate(valid.getDate() + VALID_DAYS);
  const netEur = lead.valueEur;
  const vatEur = Math.round(netEur * VAT_RATE);
  const digits = lead.id.replace(/\D/g, "").padStart(3, "0");
  return {
    number: `AN-${today.getFullYear()}-${digits}`,
    title: `Angebot KI-Assistent für ${lead.company}`,
    issuedAt: dateDe(today),
    validUntil: dateDe(valid),
    recipient: { company: lead.company, name: lead.name, email: lead.email, city: lead.city },
    situation: lead.notes,
    goal: lead.nextStep,
    lines: PACKAGES.map((p, i) => ({ pos: i + 1, title: p.title, detail: p.detail, weeks: weeks(p.from, p.to), amountEur: amounts[i]! })),
    phases: PACKAGES.map((p) => ({ label: p.title, weeks: weeks(p.from, p.to), from: p.from, to: p.to })),
    totalWeeks: PACKAGES.at(-1)!.to,
    netEur,
    vatEur,
    grossEur: netEur + vatEur,
    terms: [
      `Gültig ${VALID_DAYS} Tage bis ${dateDe(valid)}`,
      "Zahlung 40 % bei Auftrag, 40 % bei Go-live, 20 % nach Begleitphase",
      "Alle Beträge netto zuzüglich gesetzlicher Umsatzsteuer",
    ],
  };
}

/**
 * The lead a focus means. The label wins over the id: demo fixtures and the mock world number
 * leads differently (Müller GmbH is L-001 in the HUD fixtures, L-007 in the mock world).
 */
export function findLead(focus: Pick<Focus, "label" | "entityId">, leads: Lead[]): Lead | undefined {
  const label = focus.label.toLowerCase();
  return leads.find((l) => label.includes(l.company.toLowerCase()) || label.includes(l.name.toLowerCase())) ?? leads.find((l) => l.id === focus.entityId);
}

export type FocusView = { facts: string[]; offer: Offer | null };

/** The offer draft for a lead focus; null for every other entity or an unknown lead. */
export function focusOffer(focus: Pick<Focus, "entity" | "label" | "entityId">, leads: Lead[], today = new Date()): Offer | null {
  const lead = focus.entity === "lead" ? findLead(focus, leads) : undefined;
  return lead ? buildOffer(lead, today) : null;
}

/** What the stage shows for a focus: conversation facts plus, for a lead, the offer draft. */
export function focusView(s: HudState, focus: Focus, leads: Lead[], today = new Date()): FocusView {
  return { facts: focusFacts(s, focus), offer: focusOffer(focus, leads, today) };
}

export type MailDraft = { to: string; subject: string; body: string };

export function offerMailDraft(o: Offer, sender: string): MailDraft {
  return {
    to: o.recipient.email,
    subject: `${o.title} (${o.number})`,
    body: [
      `Hallo ${o.recipient.name},`,
      "",
      `anbei unser Angebot ${o.number} über ${euroDe(o.netEur)} netto. Umsetzung in ${o.totalWeeks} Wochen, gültig bis ${o.validUntil}.`,
      "",
      "Viele Grüße",
      sender,
    ].join("\n"),
  };
}

export const euroDe = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Self-contained A4 page for the print preview (no external assets, prints to PDF as is). */
export function offerHtml(o: Offer): string {
  const rows = o.lines
    .map((l) => `<tr><td>${l.pos}</td><td><b>${esc(l.title)}</b><br><small>${esc(l.detail)} · ${esc(l.weeks)}</small></td><td class="r">${euroDe(l.amountEur)}</td></tr>`)
    .join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(o.number)} ${esc(o.title)}</title><style>
@page{size:A4;margin:18mm}body{font:13px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#1f2330;max-width:180mm;margin:24px auto}
h1{font-size:24px;margin:0 0 4px}.muted{color:#6b7080}.r{text-align:right;white-space:nowrap}table{width:100%;border-collapse:collapse;margin:16px 0}
td,th{padding:8px 6px;border-bottom:1px solid #e3e4ea;vertical-align:top;text-align:left}small{color:#6b7080}
.tot td{border:0;padding:3px 6px}.gross td{font-weight:700;font-size:15px;border-top:2px solid #1f2330}.note{margin-top:24px;padding:10px;border:1px dashed #b9bccb;color:#6b7080;font-size:11px}
.bar{position:sticky;top:0;background:#fff;padding:8px 0;text-align:right}@media print{.bar{display:none}}
</style></head><body><div class="bar"><button onclick="print()">Drucken / als PDF sichern</button></div>
<p class="muted">${esc(o.number)} · ${esc(o.issuedAt)}</p><h1>${esc(o.title)}</h1>
<p>${esc(o.recipient.name)}<br>${esc(o.recipient.company)}<br>${esc(o.recipient.city)}</p>
<h3>Ausgangslage</h3><p>${esc(o.situation)}</p><h3>Leistungen</h3>
<table><tr><th>Pos.</th><th>Leistung</th><th class="r">Netto</th></tr>${rows}
<tr class="tot"><td></td><td class="r">Summe netto</td><td class="r">${euroDe(o.netEur)}</td></tr>
<tr class="tot"><td></td><td class="r">USt. ${Math.round(VAT_RATE * 100)} %</td><td class="r">${euroDe(o.vatEur)}</td></tr>
<tr class="gross"><td></td><td class="r">Gesamt brutto</td><td class="r">${euroDe(o.grossEur)}</td></tr></table>
<h3>Konditionen</h3><ul>${o.terms.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><div class="note">${esc(DEMO_NOTE)}</div></body></html>`;
}
