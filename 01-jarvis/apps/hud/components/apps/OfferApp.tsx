"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Lead } from "@jarvis/contracts";
import { useAppData } from "@/lib/apps/data";
import { DEMO_USER } from "@/lib/apps/fixtures";
import { buildOffer, DEMO_NOTE, euroDe, offerHtml, offerMailDraft, VAT_RATE, type MailDraft, type Offer } from "@/lib/apps/offer";
import { WindowShell } from "./WindowShell";

// The offer draft as a document: one paper body shared by the stage (FocusContent) and the
// manual desktop window. Everything is derived from the lead; nothing leaves the browser.

export type OfferSize = "stage" | "window" | "compact";
const SCALE: Record<OfferSize, number> = { stage: 1.32, window: 1, compact: 0.84 };
const INK = "#1f2330";
const MUTED = "#6b7080";
const LINE = "#e6e7ee";
const ACCENT = "#4f46e5";
const EASE = [0.16, 1, 0.3, 1] as const;

const rise = (i: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.1 + i * 0.07, duration: 0.45, ease: EASE } });

/** The paper itself. Its parent decides the scroll box. */
export function OfferDocument({ offer: o, size = "window" }: { offer: Offer; size?: OfferSize }) {
  const k = SCALE[size];
  const px = (n: number) => Math.round(n * k);
  const h3 = { fontSize: px(11), letterSpacing: "0.14em", color: ACCENT } as const;
  return (
    <article data-testid="offer-document" className="mx-auto w-full bg-white" style={{ color: INK, fontSize: px(13), lineHeight: 1.5, maxWidth: px(820) }}>
      <div style={{ height: px(6), background: `linear-gradient(90deg, ${ACCENT}, #a78bfa 55%, #ffc9a3)` }} />
      <div style={{ padding: `${px(22)}px ${px(30)}px ${px(26)}px` }}>
        <motion.header {...rise(0)} className="flex items-start justify-between" style={{ gap: px(20) }}>
          <div className="min-w-0">
            <div className="font-semibold uppercase" style={h3}>
              Angebotsentwurf
            </div>
            <h1 className="font-semibold leading-tight" style={{ fontSize: px(22), margin: `${px(4)}px 0 0` }}>
              {o.title}
            </h1>
          </div>
          <dl className="grid shrink-0 grid-cols-[auto_auto] text-right tabular-nums" style={{ columnGap: px(12), fontSize: px(12), color: MUTED }}>
            <dt>Nr.</dt>
            <dd className="font-medium" style={{ color: INK }}>{o.number}</dd>
            <dt>Datum</dt>
            <dd style={{ color: INK }}>{o.issuedAt}</dd>
            <dt>Gültig bis</dt>
            <dd style={{ color: INK }}>{o.validUntil}</dd>
          </dl>
        </motion.header>

        <motion.section {...rise(1)} className="grid grid-cols-2" style={{ gap: px(20), marginTop: px(18) }}>
          <div>
            <div className="font-semibold uppercase" style={h3}>Empfänger</div>
            <div className="font-medium" style={{ marginTop: px(4) }}>{o.recipient.company}</div>
            <div>{o.recipient.name}</div>
            <div style={{ color: MUTED }}>
              {o.recipient.city} · {o.recipient.email}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase" style={h3}>Ausgangslage</div>
            <p style={{ margin: `${px(4)}px 0 0` }}>{o.situation}</p>
            <p style={{ margin: `${px(4)}px 0 0`, color: MUTED }}>Nächster Schritt: {o.goal}</p>
          </div>
        </motion.section>

        <section style={{ marginTop: px(22) }}>
          <motion.div {...rise(2)} className="font-semibold uppercase" style={h3}>Leistungen</motion.div>
          <table className="w-full border-collapse tabular-nums" style={{ marginTop: px(6) }}>
            <tbody>
              {o.lines.map((l, i) => (
                <motion.tr key={l.pos} data-testid="offer-line" {...rise(3 + i)} style={{ borderBottom: `1px solid ${LINE}` }}>
                  <td className="align-top" style={{ padding: `${px(8)}px ${px(6)}px`, width: px(28), color: MUTED }}>{l.pos}</td>
                  <td style={{ padding: `${px(8)}px ${px(6)}px` }}>
                    <div className="font-medium">{l.title}</div>
                    <div style={{ color: MUTED, fontSize: px(12) }}>
                      {l.detail} · {l.weeks}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-right align-top" style={{ padding: `${px(8)}px ${px(6)}px` }}>{euroDe(l.amountEur)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          <motion.dl {...rise(9)} data-testid="offer-totals" className="ml-auto grid grid-cols-[1fr_auto] tabular-nums" style={{ width: px(300), marginTop: px(10), rowGap: px(3) }}>
            <dt style={{ color: MUTED }}>Summe netto</dt>
            <dd className="text-right">{euroDe(o.netEur)}</dd>
            <dt style={{ color: MUTED }}>USt. {Math.round(VAT_RATE * 100)} %</dt>
            <dd className="text-right">{euroDe(o.vatEur)}</dd>
            <dt className="font-semibold" style={{ borderTop: `2px solid ${INK}`, paddingTop: px(5), fontSize: px(15) }}>Gesamt brutto</dt>
            <dd data-testid="offer-gross" className="text-right font-semibold" style={{ borderTop: `2px solid ${INK}`, paddingTop: px(5), fontSize: px(15) }}>
              {euroDe(o.grossEur)}
            </dd>
          </motion.dl>
        </section>

        <motion.section {...rise(10)} style={{ marginTop: px(22) }}>
          <div className="font-semibold uppercase" style={h3}>Zeitplan · {o.totalWeeks} Wochen</div>
          <div className="flex flex-col" style={{ marginTop: px(8), gap: px(6) }}>
            {o.phases.map((p, i) => (
              <div key={p.label} className="grid items-center" style={{ gridTemplateColumns: `${px(170)}px 1fr`, gap: px(10), fontSize: px(12) }}>
                <span className="truncate">{p.label}</span>
                <div className="relative rounded-full" style={{ height: px(10), background: "#f1f1f6" }}>
                  <motion.i
                    className="absolute top-0 block h-full rounded-full"
                    style={{ left: `${((p.from - 1) / o.totalWeeks) * 100}%`, width: `${((p.to - p.from + 1) / o.totalWeeks) * 100}%`, background: `linear-gradient(90deg, ${ACCENT}, #a78bfa)`, transformOrigin: "left" }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.8 + i * 0.1, duration: 0.6, ease: EASE }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section {...rise(11)} style={{ marginTop: px(22) }}>
          <div className="font-semibold uppercase" style={h3}>Konditionen</div>
          <ul className="list-disc" style={{ margin: `${px(4)}px 0 0`, paddingLeft: px(18) }}>
            {o.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </motion.section>

        <div data-testid="offer-demo-note" className="rounded-md text-center" style={{ marginTop: px(20), padding: px(8), border: "1px dashed #c4c6d4", color: MUTED, fontSize: px(11) }}>
          {DEMO_NOTE}
        </div>
      </div>
    </article>
  );
}

/** Opens the print-safe page in a new tab (Chrome: Drucken → Als PDF sichern). */
function openPreview(o: Offer): boolean {
  const url = URL.createObjectURL(new Blob([offerHtml(o)], { type: "text/html" }));
  const win = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!win;
}

/** PDF preview and a local mail draft; the confirmation says plainly that nothing was sent. */
export function OfferActions({ offer, onCompose, onClose, tone = "light", size = "window" }: { offer: Offer; onCompose?: (d: MailDraft) => void; onClose?: () => void; tone?: "light" | "dark"; size?: OfferSize }) {
  const [note, setNote] = useState<string | null>(null);
  const dark = tone === "dark";
  const k = SCALE[size];
  const btn = { fontSize: Math.round(13 * k), padding: `${Math.round(6 * k)}px ${Math.round(14 * k)}px` };
  const ghost = dark ? { ...btn, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", color: "rgba(255,255,255,0.88)" } : { ...btn, background: "#fff", border: "1px solid #d8d8e0", color: INK };
  const primary = dark ? { ...btn, background: "#ffc9a3", color: "#1d1430" } : { ...btn, background: ACCENT, color: "#fff" };
  return (
    <div className="flex shrink-0 items-center" style={{ gap: Math.round(10 * k) }}>
      <button type="button" data-testid="offer-pdf" className="rounded-full transition-opacity hover:opacity-85" style={ghost} onClick={() => setNote(openPreview(offer) ? "PDF-Vorschau in neuem Tab geöffnet" : "Vorschau blockiert: Pop-ups erlauben")}>
        PDF-Vorschau
      </button>
      <button
        type="button"
        data-testid="offer-mail"
        className="rounded-full font-medium transition-transform active:scale-[0.98]"
        style={primary}
        onClick={() => {
          onCompose?.(offerMailDraft(offer, DEMO_USER));
          setNote(`Mail-Entwurf an ${offer.recipient.email} vorbereitet · nicht gesendet`);
        }}
      >
        Per Mail vorbereiten
      </button>
      {onClose && (
        <button type="button" data-testid="offer-close" className="rounded-full" style={ghost} onClick={onClose}>
          Schließen
        </button>
      )}
      {note && (
        <motion.span data-testid="offer-note" className="min-w-0 truncate" style={{ fontSize: Math.round(12.5 * k), color: dark ? "#9be7b4" : "#15803d" }} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
          {note}
        </motion.span>
      )}
    </div>
  );
}

/** Lead with an open offer first, then the hottest: the one a viewer expects (Müller GmbH). */
export function defaultLead(leads: Lead[]): Lead | undefined {
  return [...leads].sort((a, b) => Number(b.status === "angebot") - Number(a.status === "angebot") || b.score - a.score)[0];
}

/** Manual desktop window: the offer for one lead, the document scrolls, the toolbar stays. */
export function OfferApp({ lead, selectedLeadId, onSelect, onClose, compact, onCompose }: { lead?: Lead; selectedLeadId?: string; onSelect?: (lead: Lead) => void; onClose?: () => void; compact?: boolean; onCompose?: (d: MailDraft) => void }) {
  const leads = useAppData((s) => s.leads);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selection = selectedLeadId ?? pickedId;
  const current = lead ?? (selection ? leads.find((l) => l.id === selection) : defaultLead(leads));
  useEffect(() => { if (current) onSelect?.(current); }, [current?.id]);
  const offer = useMemo(() => (current ? buildOffer(current) : null), [current]);
  const size: OfferSize = compact ? "compact" : "window";
  return (
    <WindowShell testId="offer-app" app="offer" title={offer ? `Angebot · ${offer.recipient.company}` : "Angebot"} right={offer?.number} onClose={onClose}>
      <div className="flex h-full flex-col" style={{ background: "#eceef3" }}>
        <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2" style={{ borderColor: "#d8d8e0", background: "#f7f7fa" }}>
          {!lead && leads.length > 0 && (
            <select aria-label="Lead wählen" className="min-w-0 rounded-md border bg-white px-2 py-1 text-[13px]" style={{ borderColor: "#d8d8e0", color: INK }} value={current?.id ?? ""} onChange={(e) => { setPickedId(e.target.value); const chosen = leads.find((l) => l.id === e.target.value); if (chosen) onSelect?.(chosen); }}>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.company} · {euroDe(l.valueEur)}
                </option>
              ))}
            </select>
          )}
          {offer && <OfferActions offer={offer} onCompose={onCompose} onClose={onClose} size={size} />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: compact ? 10 : 18 }}>
          {offer ? (
            <div className="overflow-hidden rounded-md shadow-[0_6px_24px_rgba(20,20,40,0.12)]">
              <OfferDocument key={offer.number} offer={offer} size={size} />
            </div>
          ) : (
            <div className="p-6 text-center text-[14px]" style={{ color: MUTED }}>
              {selection ? "Der angefragte Lead ist nicht geladen. Wähle einen Lead oben." : "Keine Leads geladen."}
            </div>
          )}
        </div>
      </div>
    </WindowShell>
  );
}
