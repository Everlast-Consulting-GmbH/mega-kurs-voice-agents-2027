"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { resolveApproval, useHud } from "@/lib/events/store";
import type { Approval, Focus, LearnedTool, Run, Widget } from "@/lib/events/reducer";
import { AGENT_LOOK } from "@/lib/agents";
import {
  entityLabel,
  focusFacts,
  widgetDataset,
  widgetInsight,
  type Headline as HeadlineParts,
} from "@/lib/stage";
import { isTyping } from "@/lib/ui";
import { useAppData } from "@/lib/apps/data";
import { focusOffer } from "@/lib/apps/offer";
import { OfferActions, OfferDocument } from "@/components/apps/OfferApp";
import { EASE } from "./layout";
import { BarChart, LineChart, MapChart, StatBlock, TableBlock } from "./charts";

export const PEACH = "#ffc9a3";
const HEAD_BLOCK = 131; // eyebrow + gap + headline + gap below it

export function Eyebrow({ children, warm }: { children: React.ReactNode; warm?: boolean }) {
  return (
    <div className="shrink-0 text-[18px] uppercase tracking-[0.28em]" style={{ color: warm ? PEACH : "#9aa0cc" }}>
      {children}
    </div>
  );
}

export function Headline({ parts, wrap }: { parts: HeadlineParts | string; wrap?: boolean }) {
  const list = typeof parts === "string" ? [{ text: parts }] : parts;
  return (
    <h2 data-testid="stage-headline" className={`shrink-0 font-light leading-[1.15] text-white ${wrap ? "line-clamp-2 text-[46px]" : "truncate text-[54px]"}`} style={{ margin: "11px 0 31px" }}>
      {list.map((p, i) => (
        <span key={i} style={p.em ? { color: PEACH } : undefined}>
          {p.text}
        </span>
      ))}
    </h2>
  );
}

// ---- widget (Bild 3) -----------------------------------------------------------------

export function WidgetContent({ widget, height, width }: { widget: Widget; height: number; width: number }) {
  const dataset = useHud((s) => widgetDataset(s, widget));
  const insight = widgetInsight(widget, dataset);
  const area = { w: width, h: height - HEAD_BLOCK };
  return (
    <>
      <Eyebrow>{widget.title}</Eyebrow>
      <Headline parts={insight.headline} />
      <div className="relative flex-1" data-testid="stage-chart" data-kind={widget.kind}>
        {widget.kind === "bar_chart" && <BarChart widget={widget} highlight={insight.highlight} area={area} />}
        {widget.kind === "line_chart" && <LineChart widget={widget} highlight={insight.highlight} area={area} />}
        {widget.kind === "map" && <MapChart widget={widget} highlight={insight.highlight} area={area} dataset={dataset} />}
        {widget.kind === "table" && <TableBlock widget={widget} />}
        {widget.kind === "stat" && <StatBlock widget={widget} />}
      </div>
    </>
  );
}

// ---- focus: detail card of the entity ---------------------------------------------------

export function FocusContent({ focus }: { focus: Focus }) {
  const facts = useHud((s) => focusFacts(s, focus).join("\n")).split("\n").filter(Boolean);
  const leads = useAppData((s) => s.leads);
  // A lead focus shows the offer draft: the facts alone are empty unless the briefing named the lead.
  const offer = useMemo(() => focusOffer(focus, leads), [focus, leads]);
  if (offer) {
    return (
      <div data-testid="stage-offer" className="flex min-h-0 flex-1 flex-col">
        <Eyebrow>
          {entityLabel(focus.entity)} · {offer.recipient.company} · Angebotsentwurf
        </Eyebrow>
        <Headline parts={[{ text: focus.label }, { text: ` · ${offer.netEur.toLocaleString("de-DE")} €`, em: true }]} />
        {facts[0] && <div className="-mt-[16px] mb-[16px] shrink-0 truncate text-[20px] text-white/70">{facts[0]}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-[16px]" style={{ boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)" }}>
          <OfferDocument offer={offer} size="stage" />
        </div>
        <div className="mt-[18px]">
          <OfferActions offer={offer} tone="dark" size="stage" />
        </div>
      </div>
    );
  }
  return (
    <>
      <Eyebrow>
        {entityLabel(focus.entity)} · {focus.entityId}
      </Eyebrow>
      <Headline parts={focus.label} />
      <Facts facts={facts} />
    </>
  );
}

function Facts({ facts }: { facts: string[] }) {
  return (
    <div className="flex flex-col gap-[19px]">
      {facts.map((f, i) => (
        <motion.div key={f} className="flex gap-5 text-[26px] leading-snug text-white/90" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.12, duration: 0.5, ease: EASE }}>
          <span className="mt-[0.55em] h-[2px] w-6 shrink-0 rounded-full" style={{ background: PEACH }} />
          <span>{f}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ---- approval -----------------------------------------------------------------------

const RISK = { low: "niedrig", medium: "mittel", high: "hoch" } as const;

export function ApprovalContent({ approval: a }: { approval: Approval }) {
  return (
    <div data-testid="stage-approval" data-status={a.status} className="flex flex-1 flex-col">
      <Eyebrow warm={a.risk === "high"}>Freigabe nötig · Risiko {RISK[a.risk]}</Eyebrow>
      <Headline parts={a.title} />
      <div className="rounded-[19px] px-8 py-7 text-[26px] leading-snug text-white/90" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
        {a.detail}
      </div>
      <ApprovalActions approval={a} approveLabel="Freigeben" />
    </div>
  );
}

// ---- plan of a multi-agent run ------------------------------------------------------------

/** run.planned: the steps, one agent per app, and one approval for all of them. */
export function PlanContent({ approval: a, run, compact }: { approval: Approval; run: Run; compact?: boolean }) {
  const n = run.steps.length;
  return (
    <div data-testid="stage-plan" data-status={a.status} className="flex flex-1 flex-col">
      <Eyebrow>
        Plan · {n} {n === 1 ? "Schritt" : "Schritte"} · eine Freigabe
      </Eyebrow>
      <Headline parts={run.title} wrap />
      <div className={`flex flex-col ${compact ? "gap-[8px]" : "gap-[14px]"}`}>
        {run.steps.map((st, i) => {
          const look = AGENT_LOOK[st.app];
          return (
            <motion.div
              key={st.agentId}
              data-testid={`plan-step-${i}`}
              className={`flex items-center gap-[22px] rounded-[18px] px-[24px] ${compact ? "py-[9px]" : "py-[17px]"}`}
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.12, duration: 0.5, ease: EASE }}
            >
              <span className="w-[30px] text-[24px] font-light tabular-nums text-white/45">{i + 1}</span>
              <span className="flex w-[140px] shrink-0 items-center gap-[10px] text-[20px]" style={{ color: "#dfe2ff" }}>
                <i className="block h-[12px] w-[12px] rounded-full" style={{ background: look.color, boxShadow: `0 0 14px ${look.color}` }} />
                {look.app}
              </span>
              <span className="min-w-0 flex-1 text-[25px] leading-snug text-white/92">{st.summary}</span>
            </motion.div>
          );
        })}
      </div>
      <ApprovalActions approval={a} approveLabel="Ja, los" tight={compact} />
    </div>
  );
}

function ApprovalActions({ approval: a, approveLabel, tight }: { approval: Approval; approveLabel: string; tight?: boolean }) {
  const pending = a.status === "pending";
  const [sendFailed, setSendFailed] = useState(false);
  const decide = (approved: boolean) => setSendFailed(!resolveApproval(a.approvalId, approved));

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key !== "Enter" && e.key !== "Escape") return;
      // Enter would also press whatever button has focus (e.g. "Beenden" in the call bar).
      e.preventDefault();
      setSendFailed(!resolveApproval(a.approvalId, e.key === "Enter"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, a.approvalId]);

  return (
    <div className={`${tight ? "mt-[24px]" : "mt-[40px]"} flex items-center gap-4`}>
      {pending ? (
        <>
          <button type="button" data-testid="approval-reject" onClick={() => decide(false)} className="rounded-full px-9 py-4 text-[22px] text-white/85 transition-colors hover:text-white" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)" }}>
            Ablehnen
          </button>
          <button type="button" data-testid="approval-approve" onClick={() => decide(true)} className="rounded-full px-9 py-4 text-[22px] font-medium transition-transform active:scale-[0.98]" style={{ background: PEACH, color: "#1d1430", boxShadow: "0 10px 40px -10px rgba(255,201,163,0.6)" }}>
            {approveLabel}
          </button>
          <span className="ml-4 text-[19px]" style={{ color: "#9aa0cc" }}>
            {sendFailed ? "Nicht gesendet: keine Verbindung zum Orchestrator" : "oder sag „Ja“ · Enter / Esc"}
          </span>
        </>
      ) : (
        <motion.div className="flex items-center gap-4 text-[26px]" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} data-testid="approval-outcome">
          <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: a.status === "approved" ? "rgba(155,231,180,0.16)" : "rgba(255,255,255,0.08)", border: `1.5px solid ${a.status === "approved" ? "#9be7b4" : "rgba(255,255,255,0.4)"}` }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a.status === "approved" ? "#9be7b4" : "#fff"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {a.status === "approved" ? <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45 }} /> : <path d="M6 6l12 12M18 6L6 18" />}
            </svg>
          </span>
          <span className="text-white/90">
            {a.status === "approved" ? "Freigegeben" : "Abgelehnt"} {a.via === "voice" ? "per Stimme" : "per Klick"}
          </span>
        </motion.div>
      )}
    </div>
  );
}

// ---- tool learned ---------------------------------------------------------------------

export function LearnedContent({ learned: l }: { learned: LearnedTool }) {
  return (
    <div data-testid="stage-learned" className="flex flex-1 flex-col">
      <Eyebrow>Neues Werkzeug gelernt</Eyebrow>
      <Headline parts={l.description} />
      <div className="mb-6 text-[22px] text-white/70">
        <span className="font-mono text-white">{l.tool}</span> · {l.endpoints.length} {l.endpoints.length === 1 ? "Endpunkt" : "Endpunkte"}
      </div>
      <div className="flex flex-col gap-3">
        {l.endpoints.map((e, i) => (
          <motion.div
            key={`${e.method} ${e.path}`}
            className="flex items-center gap-5 rounded-[16px] px-6 py-4"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.15, duration: 0.5, ease: EASE }}
          >
            <span className="w-[84px] rounded-full py-1 text-center font-mono text-[18px] font-medium" style={{ background: e.method === "GET" ? "rgba(170,180,255,0.16)" : "rgba(255,201,163,0.18)", color: e.method === "GET" ? "#c9cdf0" : PEACH }}>
              {e.method}
            </span>
            <span className="truncate font-mono text-[24px] text-white/90">{e.path}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
