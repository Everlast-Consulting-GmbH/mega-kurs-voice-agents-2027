"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Lead } from "@jarvis/contracts";
import { useAppData } from "@/lib/apps/data";
import { DEMO_USER } from "@/lib/apps/fixtures";
import { usePlaybackNow } from "@/lib/apps/usePlayback";
import { crmView, euro, initials } from "@/lib/apps/views";
import { useCrmDemo, HOT_SCORE, leadTimeline, matchesLead, nextStatus, STATUS_LABEL, STATUS_ORDER, withOverrides, type CrmDemoAction, type CrmDemoState, type CrmFilter } from "@/lib/apps/crmDemo";
import { playhead, type Played } from "@/lib/agents";
import { AgentCursor } from "./AgentCursor";
import type { AgentLook } from "./MailApp";
import { WindowShell } from "./WindowShell";
import { Check, Chevron, File, Filter, Pencil, Plus, Search, Send } from "./icons";

export const COLUMNS: Array<{ status: Lead["status"]; label: string; color: string }> = [
  { status: "qualifiziert", label: "Qualifiziert", color: "#94a3b8" },
  { status: "angebot", label: "Angebot", color: "#3b82f6" },
  { status: "verhandlung", label: "Verhandlung", color: "#f59e0b" },
  { status: "gewonnen", label: "Gewonnen", color: "#22c55e" },
];
const MOVE_GREEN = "#22c55e";

type Box = { x: number; y: number; w: number };

function boxOf(board: HTMLElement, el: Element | null): Box | null {
  if (!el) return null;
  const b = board.getBoundingClientRect();
  const k = b.width / (board.offsetWidth || 1) || 1;
  const r = el.getBoundingClientRect();
  return { x: (r.left - b.left) / k, y: (r.top - b.top) / k, w: r.width / k };
}

export const scoreTone = (score: number) => (score >= 85 ? { bg: "#dcfce7", fg: "#166534" } : score >= 70 ? { bg: "#fef9c3", fg: "#854d0e" } : { bg: "#f1f5f9", fg: "#475569" });

type CrmProps = {
  played: Played[];
  agent?: AgentLook;
  /** lets the user open deals, search and move them locally (no backend writes) */
  interactive?: boolean;
  onClose?: () => void;
  onOffer?: (lead: Lead) => void;
  initialLeadId?: string;
  onSelect?: (lead: Lead) => void;
};

/** Sales pipeline as a kanban board; the agent drags the deal to its new phase. */
export function CrmApp({ played, agent, interactive = false, onClose, onOffer, initialLeadId, onSelect }: CrmProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const now = usePlaybackNow(played);
  const leads = useAppData((s) => s.leads);
  const view = crmView(leads, played, now);
  const { current } = playhead(played, now);
  const moving = view.moving;
  const flying = moving?.flying ? moving : null;
  const [flight, setFlight] = useState<{ key: number; from: Box; to: Box } | null>(null);
  // Manual state lives beside the playback view; it never feeds back into crmView.
  const demo = useCrmDemo((s) => s.state);
  const dispatch = useCrmDemo((s) => s.dispatch);
  useEffect(() => {
    if (interactive && initialLeadId) dispatch({ type: "select", id: initialLeadId });
  }, [interactive, initialLeadId]);
  const boardLeads = interactive ? withOverrides(view.leads, demo, moving?.leadId) : view.leads;
  const shown = (l: Lead) => !interactive || matchesLead(l, demo.query, demo.filter);
  const selected = interactive && demo.selectedId ? boardLeads.find((l) => l.id === demo.selectedId) : undefined;
  const movedLocally = new Set(interactive ? Object.keys(demo.overrides) : []);
  const noticeSeq = demo.notice?.seq;

  useEffect(() => {
    if (!noticeSeq) return;
    const t = setTimeout(() => dispatch({ type: "dismiss" }), 3600);
    return () => clearTimeout(t);
  }, [noticeSeq]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dispatch({ type: "close" });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selected]);

  // Measure where the card leaves and lands once per flight (before the placeholders animate).
  const flyKey = flying?.hit ?? null;
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (flyKey === null || !board) {
      setFlight(null);
      return;
    }
    const from = boxOf(board, board.querySelector("[data-src]"));
    const to = boxOf(board, board.querySelector("[data-drop]"));
    if (from && to) setFlight({ key: flyKey, from, to: { ...to, w: from.w } });
  }, [flyKey]);

  const total = boardLeads.filter((l) => l.status !== "verloren" && l.status !== "gewonnen" && l.status !== "neu").reduce((s, l) => s + l.valueEur, 0);
  const target = !current
    ? null
    : current.action === "open"
      ? "crm:title"
      : current.action === "move" && flying
        ? "crm:drop"
        : current.entityId
          ? `crm:card-${current.entityId}`
          : "crm:title";
  const clicked = current && now >= current.hit && (current.action === "select" || current.action === "open") ? current.seq : null;
  const movingLead = moving ? boardLeads.find((l) => l.id === moving.leadId) : undefined;

  return (
    <WindowShell
      onClose={onClose}
      ref={rootRef}
      testId="app-crm"
      app="crm"
      title="CRM – Pipeline"
      right={
        interactive &&
        onClose && (
          <button type="button" data-testid="crm-close" onClick={onClose} className="rounded-[6px] px-[8px] py-[2px] text-[13px] text-[#4b5563] hover:bg-black/5">
            Schließen
          </button>
        )
      }
      overlay={
        agent && (
          <AgentCursor
            rootRef={rootRef}
            target={target}
            color={agent.color}
            label={agent.label}
            click={clicked}
            drag={flying ? (flying.end - flying.hit) / 1000 : undefined}
            version={`${flying ? "fly" : "rest"}-${flight?.key ?? ""}`}
            done={agent.done}
          />
        )
      }
    >
      <div className="flex h-full flex-col" style={{ background: "#f5f6f8" }}>
        <div className="flex h-[46px] shrink-0 items-center gap-[10px] border-b border-[#e6e8ec] bg-white px-[16px]">
          <span className="text-[16px] font-semibold text-[#111827]" data-t="crm:title" data-tx="0.3">
            Pipeline
          </span>
          <span className="flex items-center gap-1 rounded-[7px] border border-[#e2e4ea] px-[9px] py-[2px] text-[13px] text-[#4b5563]">
            Vertrieb 2026 <Chevron size={13} />
          </span>
          {interactive ? (
            <CrmToolbar state={demo} dispatch={dispatch} hits={boardLeads.filter(shown).length} total={boardLeads.length} />
          ) : (
            <span className="flex items-center gap-1 text-[13px] text-[#6b7280]">
              <Filter size={15} /> Alle Deals
            </span>
          )}
          <span className="ml-auto text-[13px] text-[#6b7280]">
            Offen <b className="font-semibold tabular-nums text-[#111827]">{euro(total)}</b>
          </span>
          <span className="flex items-center gap-1 rounded-[7px] bg-[#16a34a] px-[10px] py-[4px] text-[13px] font-semibold text-white">
            <Plus size={14} /> Deal
          </span>
        </div>

        <div ref={boardRef} className="relative flex min-h-0 flex-1 gap-[10px] px-[12px] pt-[10px]">
          {COLUMNS.map((col) => {
            const cards = boardLeads.filter((l) => l.status === col.status && shown(l)).sort((a, b) => b.valueEur - a.valueEur);
            const dropHere = flying?.to === col.status;
            const sum = cards.reduce((s, l) => s + l.valueEur, 0) + (dropHere && movingLead ? movingLead.valueEur : 0) - (flying?.from === col.status && movingLead ? movingLead.valueEur : 0);
            const count = cards.length + (dropHere ? 1 : 0) - (flying?.from === col.status ? 1 : 0);
            return (
              <div key={col.status} className="flex min-w-0 flex-1 flex-col rounded-[10px] px-[7px] pb-[6px]" style={{ background: "#eceef2" }} data-t={`crm:col-${col.status}`}>
                <div className="mx-[-7px] mb-[8px] h-[3px] rounded-t-[10px]" style={{ background: col.color }} />
                <div className="mb-[8px] flex items-baseline gap-[6px] px-[3px]">
                  <span className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[#4b5563]">{col.label}</span>
                  <span className="rounded-full bg-white px-[6px] text-[11.5px] font-semibold text-[#6b7280]">{count}</span>
                  <span className="ml-auto text-[12px] tabular-nums text-[#6b7280]">{euro(sum)}</span>
                </div>
                {dropHere && (
                  <motion.div
                    data-drop
                    data-t="crm:drop"
                    data-ty="0.45"
                    className="mb-[7px] shrink-0 rounded-[9px]"
                    style={{ border: `2px dashed ${MOVE_GREEN}`, background: "rgba(34,197,94,0.08)" }}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 66, opacity: 1 }}
                    transition={{ duration: 0.35 }}
                  />
                )}
                {cards.map((l) => {
                  if (flying && l.id === flying.leadId)
                    return <motion.div key={l.id} data-src className="mb-[7px] shrink-0 rounded-[9px]" initial={{ height: 66 }} animate={{ height: 0, marginBottom: 0 }} transition={{ duration: 0.5, delay: 0.15 }} style={{ height: 66 }} />;
                  return (
                    <DealCard
                      key={l.id}
                      lead={l}
                      selected={(view.selectedId === l.id && !!agent) || selected?.id === l.id}
                      color={selected?.id === l.id ? "#2563eb" : agent?.color}
                      movedAt={view.movedAt[l.id]}
                      label={view.movedAt[l.id] ? col.label : undefined}
                      local={movedLocally.has(l.id) && !view.movedAt[l.id] ? demo.log.findLast((e) => e.leadId === l.id && e.kind === "move")?.seq : undefined}
                      onOpen={interactive ? () => { dispatch({ type: "select", id: l.id }); onSelect?.(l); } : undefined}
                    />
                  );
                })}
              </div>
            );
          })}
          {flying && flight && movingLead && (
            <motion.div
              key={flight.key}
              data-testid="crm-flying"
              className="pointer-events-none absolute left-0 top-0"
              style={{ width: flight.from.w, zIndex: 10 }}
              initial={{ x: flight.from.x, y: flight.from.y, rotate: 0, scale: 1 }}
              animate={{ x: flight.to.x, y: flight.to.y, rotate: [0, -3, -3, 0], scale: [1, 1.04, 1.04, 1] }}
              transition={{ duration: (flying.end - flying.hit) / 1000, ease: [0.45, 0, 0.25, 1], rotate: { duration: (flying.end - flying.hit) / 1000, times: [0, 0.2, 0.8, 1] }, scale: { duration: (flying.end - flying.hit) / 1000, times: [0, 0.2, 0.8, 1] } }}
            >
              <DealCard lead={movingLead} lifted />
            </motion.div>
          )}
          <AnimatePresence>
            {selected && (
              <DealDetail
                key="detail"
                lead={selected}
                state={demo}
                dispatch={dispatch}
                locked={moving?.leadId === selected.id}
                onOffer={
                  onOffer &&
                  (() => {
                    dispatch({ type: "offer", lead: selected, linked: true });
                    onOffer(selected);
                  })
                }
              />
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {interactive && demo.notice && (
            <motion.div
              key={demo.notice.seq}
              data-testid="crm-notice"
              role="status"
              className="pointer-events-none absolute bottom-[14px] left-1/2 z-30 flex items-center gap-2 rounded-[10px] px-[14px] py-[8px] text-[13.5px] font-medium text-white shadow-lg"
              style={{ background: demo.notice.tone === "success" ? "#15803d" : "#1e293b", x: "-50%" }}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {demo.notice.tone === "success" ? <Check size={15} /> : <Pencil size={15} />}
              {demo.notice.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </WindowShell>
  );
}

type DealCardProps = { lead: Lead; selected?: boolean; color?: string; movedAt?: number; label?: string; lifted?: boolean; local?: number; onOpen?: () => void };

function DealCard({ lead: l, selected, color, movedAt, label, lifted, local, onOpen }: DealCardProps) {
  const tone = scoreTone(l.score);
  const flash = movedAt || local;
  return (
    <motion.div
      // a fresh key per local move replays the green flash
      key={local ?? "card"}
      data-t={`crm:card-${l.id}`}
      data-tx="0.35"
      data-testid={movedAt ? "crm-moved" : undefined}
      data-lead={l.id}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen && ((e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen()))}
      whileHover={onOpen ? { y: -2 } : undefined}
      className={`relative mb-[7px] shrink-0 rounded-[9px] bg-white px-[10px] py-[8px]${onOpen ? " cursor-pointer outline-none" : ""}`}
      initial={flash ? { boxShadow: `0 0 0 2.5px ${MOVE_GREEN}, 0 8px 20px rgba(34,197,94,0.3)` } : false}
      animate={{
        boxShadow: lifted
          ? `0 0 0 2.5px ${MOVE_GREEN}, 0 18px 36px rgba(0,0,0,0.28)`
          : selected
            ? `0 0 0 2.5px ${color}, 0 2px 6px rgba(0,0,0,0.08)`
            : "0 0 0 0px rgba(0,0,0,0), 0 1px 3px rgba(0,0,0,0.1)",
      }}
      transition={{ duration: flash ? 1.4 : 0.3, delay: flash ? 1.2 : 0 }}
    >
      <div className="flex items-center gap-2">
        <b className="truncate text-[14.5px] font-semibold text-[#111827]">{l.company}</b>
        {label && (
          <motion.span className="ml-auto shrink-0 rounded-full px-[7px] text-[11px] font-semibold text-white" style={{ background: MOVE_GREEN }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
            verschoben
          </motion.span>
        )}
        {!label && local && (
          <motion.span data-testid="crm-local-moved" className="ml-auto shrink-0 rounded-full px-[7px] text-[11px] font-semibold text-white" style={{ background: MOVE_GREEN }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
            lokal verschoben
          </motion.span>
        )}
      </div>
      <div className="truncate text-[12.5px] text-[#6b7280]">{l.name}</div>
      <div className="mt-[3px] flex items-center gap-[6px]">
        <span className="text-[13.5px] font-semibold tabular-nums text-[#111827]">{euro(l.valueEur)}</span>
        <span className="rounded-[5px] px-[5px] text-[11.5px] font-semibold tabular-nums" style={{ background: tone.bg, color: tone.fg }}>
          {l.score}
        </span>
        <span className="ml-auto flex h-[20px] w-[20px] items-center justify-center rounded-full bg-[#e0e7ff] text-[10px] font-bold text-[#3730a3]">{initials(DEMO_USER)}</span>
      </div>
    </motion.div>
  );
}

const FILTERS: Array<{ value: CrmFilter; label: string }> = [
  { value: "alle", label: "Alle" },
  { value: "heiss", label: `Heiß ≥ ${HOT_SCORE}` },
  ...COLUMNS.map((c) => ({ value: c.status as CrmFilter, label: c.label })),
];

function CrmToolbar({ state, dispatch, hits, total }: { state: CrmDemoState; dispatch: React.Dispatch<CrmDemoAction>; hits: number; total: number }) {
  return (
    <div className="flex min-w-0 items-center gap-[8px]">
      <label className="flex h-[28px] w-[190px] items-center gap-[6px] rounded-[7px] border border-[#e2e4ea] bg-[#f8f9fb] px-[8px] text-[#6b7280] focus-within:border-[#93c5fd] focus-within:bg-white">
        <Search size={14} />
        <input
          data-testid="crm-search"
          type="search"
          value={state.query}
          onChange={(e) => dispatch({ type: "search", query: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Firma, Kontakt, Stadt …"
          aria-label="Deals durchsuchen"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9ca3af]"
        />
      </label>
      <div className="flex items-center gap-[3px]" role="group" aria-label="Filter">
        {FILTERS.map((f) => {
          const on = state.filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              data-testid={`crm-filter-${f.value}`}
              aria-pressed={on}
              onClick={() => dispatch({ type: "filter", filter: on ? "alle" : f.value })}
              className="rounded-full px-[8px] py-[2px] text-[12px] font-medium transition-colors"
              style={on ? { background: "#111827", color: "#fff" } : { background: "#eef0f3", color: "#4b5563" }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      {(state.query || state.filter !== "alle") && (
        <span data-testid="crm-hits" className="shrink-0 text-[12px] tabular-nums text-[#6b7280]">
          {hits} von {total}
        </span>
      )}
    </div>
  );
}

function DealDetail({ lead, state, dispatch, locked, onOffer }: { lead: Lead; state: CrmDemoState; dispatch: React.Dispatch<CrmDemoAction>; locked: boolean; onOffer?: () => void }) {
  const tone = scoreTone(lead.score);
  const col = COLUMNS.find((c) => c.status === lead.status);
  const next = nextStatus(lead.status);
  const draft = state.drafts[lead.id];
  const timeline = leadTimeline(lead, state.log, Date.now());
  const move = (to: Lead["status"]) => dispatch({ type: "move", lead, to });
  return (
    <motion.aside
      data-testid="crm-detail"
      aria-label={`Deal ${lead.company}`}
      className="absolute bottom-0 right-0 top-0 z-20 flex w-[360px] flex-col border-l border-[#e2e4ea] bg-white"
      style={{ boxShadow: "-18px 0 40px rgba(15,23,42,0.16)" }}
      initial={{ x: 380, opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
    >
      <div className="flex items-start gap-[10px] border-b border-[#eef0f3] px-[16px] pb-[12px] pt-[14px]">
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#e0e7ff] text-[14px] font-bold text-[#3730a3]">{initials(lead.company)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16.5px] font-semibold text-[#111827]">{lead.company}</div>
          <div className="truncate text-[13px] text-[#6b7280]">
            {lead.name} · {lead.city}
          </div>
        </div>
        <button type="button" data-testid="crm-detail-close" aria-label="Details schließen" onClick={() => dispatch({ type: "close" })} className="rounded-[6px] px-[7px] py-[1px] text-[18px] leading-none text-[#6b7280] hover:bg-[#f1f5f9]">
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[16px] py-[12px]">
        <div className="grid grid-cols-3 gap-[8px]">
          <Stat label="Wert" value={euro(lead.valueEur)} />
          <Stat label="Score" value={<span className="rounded-[5px] px-[6px]" style={{ background: tone.bg, color: tone.fg }}>{lead.score}</span>} />
          <Stat label="Phase" value={<motion.span key={lead.status} initial={{ scale: 1.25, color: MOVE_GREEN }} animate={{ scale: 1, color: col?.color ?? "#475569" }} transition={{ duration: 0.6 }} className="inline-block">{STATUS_LABEL[lead.status]}</motion.span>} />
        </div>

        <dl className="mt-[12px] grid grid-cols-[70px_1fr] gap-x-[10px] gap-y-[5px] text-[13px]">
          <dt className="text-[#9ca3af]">Kontakt</dt>
          <dd className="truncate text-[#111827]">{lead.name}</dd>
          <dt className="text-[#9ca3af]">E-Mail</dt>
          <dd className="truncate text-[#2563eb]">{lead.email}</dd>
          <dt className="text-[#9ca3af]">Telefon</dt>
          <dd className="truncate tabular-nums text-[#111827]">{lead.phone}</dd>
        </dl>

        <div className="mt-[12px] rounded-[9px] border border-[#fde68a] bg-[#fffbeb] px-[11px] py-[8px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#92400e]">Nächster Schritt</div>
          <div className="text-[13.5px] text-[#111827]">{lead.nextStep}</div>
        </div>

        <div className="mt-[12px]">
          <div className="mb-[5px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]">Phase ändern</div>
          <div className="flex items-center gap-[6px]">
            <select
              data-testid="crm-status"
              value={lead.status}
              disabled={locked}
              onChange={(e) => move(e.target.value as Lead["status"])}
              className="h-[30px] flex-1 rounded-[7px] border border-[#d1d5db] bg-white px-[8px] text-[13px] text-[#111827]"
            >
              {STATUS_ORDER.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABEL[st]}
                </option>
              ))}
            </select>
            {next && (
              <button
                type="button"
                data-testid="crm-advance"
                disabled={locked}
                onClick={() => move(next)}
                className="flex h-[30px] items-center gap-1 rounded-[7px] px-[10px] text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: MOVE_GREEN }}
              >
                Nach {STATUS_LABEL[next]} <Chevron size={13} dir="right" />
              </button>
            )}
          </div>
          <div className="mt-[4px] text-[11.5px] text-[#9ca3af]">{locked ? "Jarvis bewegt diesen Deal gerade." : "Lokale Simulation, wird nicht gespeichert."}</div>
        </div>

        <div className="mt-[12px] grid grid-cols-2 gap-[6px]">
          <button
            type="button"
            data-testid="crm-offer"
            onClick={onOffer ?? (() => dispatch({ type: "offer", lead, linked: false }))}
            className="flex h-[32px] items-center justify-center gap-[6px] rounded-[7px] bg-[#2563eb] text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
          >
            <File size={14} /> Angebot ansehen
          </button>
          <button
            type="button"
            data-testid="crm-draft"
            onClick={() => dispatch({ type: "draft", lead })}
            className="flex h-[32px] items-center justify-center gap-[6px] rounded-[7px] border border-[#d1d5db] text-[13px] font-semibold text-[#111827] hover:bg-[#f8fafc]"
          >
            <Send size={14} /> Nachricht vorbereiten
          </button>
        </div>

        <AnimatePresence>
          {draft && (
            <motion.div data-testid="crm-draft-preview" className="mt-[10px] overflow-hidden rounded-[9px] border border-dashed border-[#94a3b8] bg-[#f8fafc]" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <div className="flex items-center gap-[6px] border-b border-[#e2e8f0] px-[10px] py-[5px] text-[11.5px] font-semibold text-[#475569]">
                <Pencil size={12} /> Lokaler Entwurf an {lead.email}
                <span className="ml-auto font-normal text-[#94a3b8]">nicht gesendet</span>
              </div>
              <pre className="whitespace-pre-wrap px-[10px] py-[8px] font-sans text-[12.5px] leading-[1.45] text-[#1f2937]">{draft}</pre>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-[14px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]">Verlauf</div>
        <ol data-testid="crm-timeline" className="mt-[6px] border-l-2 border-[#e5e7eb] pl-[12px]">
          {timeline.map((e) => (
            <motion.li key={e.key} layout initial={e.local ? { opacity: 0, x: -8 } : false} animate={{ opacity: 1, x: 0 }} className="relative mb-[9px]">
              <i className="absolute left-[-18px] top-[5px] block h-[10px] w-[10px] rounded-full border-2 border-white" style={{ background: e.local ? MOVE_GREEN : "#cbd5e1" }} />
              <div className="flex items-baseline gap-[6px] text-[13px]">
                <span className="font-medium text-[#111827]">{e.label}</span>
                {e.when && <span className="ml-auto shrink-0 text-[11.5px] text-[#9ca3af]">{e.when}</span>}
              </div>
              {e.detail && <div className="text-[12px] leading-[1.35] text-[#6b7280]">{e.detail}</div>}
            </motion.li>
          ))}
        </ol>
      </div>
    </motion.aside>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[8px] bg-[#f5f6f8] px-[9px] py-[6px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{label}</div>
      <div className="truncate text-[14px] font-semibold tabular-nums text-[#111827]">{value}</div>
    </div>
  );
}
