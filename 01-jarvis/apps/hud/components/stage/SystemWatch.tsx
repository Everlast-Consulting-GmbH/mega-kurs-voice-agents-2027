"use client";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useHud } from "@/lib/events/store";
import { useUi } from "@/lib/ui";
import { useAppData } from "@/lib/apps/data";
import { useMailDemo } from "@/lib/apps/mailDemo";
import { useCrmDemo, withOverrides } from "@/lib/apps/crmDemo";
import { desktopLead } from "@/lib/apps/desktop";
import { useNow } from "@/lib/hooks";
import { stageMode, stageItem } from "@/lib/stage";
import { sfx } from "@/lib/sound/sfx";
import { BODY, SYSTEM_HELP, linkPath, summarizeSystems, type SystemNode, type SystemTone } from "@/lib/avatar/systems";
import { HEAD, PANELS, PANEL_HEAD, RING, ROW_H, headAnchor, toolRing, type ToolSpot } from "@/lib/avatar/deck";
import { Panel, ActivityPanel, VoicePanel } from "./deck/Panel";
import { Globe } from "./deck/Globe";
import { ACTIVE, ICE, ICE_DIM, ICE_HI, LINE, MONO, toneColor } from "./deck/palette";

// The control deck around Jarvis in calm mode ("Kontrollzentrale"). Two slim instrument columns
// at the screen edges, the head as the centre: a ring of every tool he can call, links from him
// to each system row and pulses that travel while a system works. "Systeme überwachen" pulls the
// camera back to the full figure and the links leave from his body instead. All data comes from
// the HUD's own state; motion is CSS (compositor) or two small canvases, and reduced motion stops it.

type Props = { expanded: boolean; onToggle: () => void };

const TONE_LABEL: Record<SystemTone, string> = { idle: "Bereit", active: "Aktiv", done: "Erledigt", error: "Fehler" };

const CSS = `
@keyframes sw-dash { to { stroke-dashoffset: -240; } }
@keyframes sw-travel { from { offset-distance: 0%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } to { offset-distance: 100%; opacity: 0; } }
@keyframes sw-breathe { 0%,100% { opacity: .45; transform: scale(1); } 50% { opacity: .9; transform: scale(1.06); } }
@keyframes sw-ping { from { transform: scale(.6); opacity: .9; } to { transform: scale(2.4); opacity: 0; } }
@keyframes sw-spin { to { transform: rotate(360deg); } }
@keyframes sw-meridian { 0% { transform: scaleX(1); } 50% { transform: scaleX(.15); } 100% { transform: scaleX(1); } }
@keyframes sw-scan { 0%,100% { transform: translateY(-15px); opacity: 0; } 20%,80% { opacity: .9; } 50% { transform: translateY(15px); } }
@keyframes sw-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes sw-blink { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes sw-feed { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
.sw-flow { animation: sw-dash 6s linear infinite; }
.sw-breathe { transform-box: fill-box; transform-origin: center; animation: sw-breathe 4.5s ease-in-out infinite; }
.sw-ping { transform-box: fill-box; transform-origin: center; animation: sw-ping 1.6s ease-out infinite; }
.sw-pulse { position: absolute; left: 0; top: 0; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; border-radius: 50%; offset-rotate: 0deg; animation: sw-travel 3.2s linear infinite; will-change: offset-distance; }
.sw-spin { transform-box: view-box; animation: sw-spin 60s linear infinite; }
.sw-spin.rev { animation-direction: reverse; animation-duration: 90s; }
.sw-meridian { transform-box: fill-box; transform-origin: center; animation: sw-meridian 5s ease-in-out infinite; }
.sw-scan { animation: sw-scan 3.6s ease-in-out infinite; }
.sw-in { animation: sw-in .7s cubic-bezier(.2,.8,.2,1) both; }
.sw-now { animation: sw-blink 2s ease-in-out infinite; }
.sw-feed { animation: sw-feed .45s cubic-bezier(.2,.8,.2,1) both; }
@media (prefers-reduced-motion: reduce) {
  .sw-flow, .sw-breathe, .sw-ping, .sw-spin, .sw-meridian, .sw-scan, .sw-in, .sw-now, .sw-feed { animation: none !important; }
  .sw-pulse { display: none; }
}
`;

/** Small icon per system; the web one is a slowly scanning globe. */
function SystemIcon({ id, color, size = 30 }: { id: SystemNode["id"]; color: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 32 32", fill: "none", stroke: color, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "mail":
      return <svg {...common}><rect x="5" y="9" width="22" height="15" rx="2" /><path d="M5 10l11 8 11-8" /></svg>;
    case "crm":
      return <svg {...common}><path d="M7 25V15M13 25V9M19 25v-7M25 25V6" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="5" y="7" width="22" height="19" rx="2" /><path d="M5 13h22M11 4v5M21 4v5" /></svg>;
    case "team":
      return <svg {...common}><circle cx="12" cy="12" r="4" /><circle cx="22" cy="13" r="3" /><path d="M5 25c1-5 4-7 7-7s6 2 7 7M19 19c3 0 6 1 8 5" /></svg>;
    case "computer":
      return <svg {...common}><rect x="4" y="6" width="24" height="16" rx="2" /><path d="M12 27h8M16 22v5M15 13l3 3-3 3" /></svg>;
    case "web":
      return (
        <svg {...common} overflow="hidden">
          <circle cx="16" cy="16" r="11" />
          <ellipse className="sw-meridian" cx="16" cy="16" rx="5" ry="11" />
          <path d="M5 16h22M7 10.5h18M7 21.5h18" opacity=".6" />
          <g className="sw-scan"><path d="M6 16h20" stroke={color} strokeWidth="2.2" opacity=".9" /></g>
        </svg>
      );
  }
}

/** Twelve segments: how much of something countable is open (unread, open leads, upcoming). */
function Gauge({ value, total, color }: { value: number; total: number; color: string }) {
  const lit = Math.round((Math.min(value, total) / total) * 12);
  return (
    <span className="flex gap-[3px]" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} className="block h-[4px] w-[11px]" style={{ background: i < lit ? color : "rgba(169,200,216,0.14)", boxShadow: i < lit ? `0 0 6px ${color}66` : undefined, transition: "background .6s" }} />
      ))}
    </span>
  );
}

/** One system as a row in a deck panel; the link from Jarvis lands on its inner edge. */
function SystemRow({ node, index, height, onPick }: { node: SystemNode; index: number; height: number; onPick: (n: SystemNode) => void }) {
  const c = toneColor(node.tone);
  const lit = node.tone !== "idle";
  const action = node.app ? `${node.label} öffnen` : `${node.label}: Hinweise anzeigen`;
  const inner = node.side === "left" ? "right" : "left";
  return (
    <button
      type="button"
      data-testid={`system-node-${node.id}`}
      data-tone={node.tone}
      aria-label={`${action}. ${node.metric}. ${node.source}. Status ${TONE_LABEL[node.tone]}`}
      title={action}
      onClick={() => onPick(node)}
      className="absolute left-0 right-0 flex items-center gap-[12px] px-[14px] text-left transition-[background] duration-300 hover:bg-white/[0.05]"
      style={{ top: PANEL_HEAD + index * height, height, borderTop: index ? "1px solid rgba(169,200,216,0.07)" : undefined, background: lit ? `linear-gradient(${inner === "right" ? 90 : 270}deg, transparent, ${c}14)` : undefined }}
    >
      <i aria-hidden="true" className="absolute block w-[2px]" style={{ [inner]: -1, top: 14, bottom: 14, background: lit ? c : "transparent", boxShadow: lit ? `0 0 12px ${c}` : undefined, transition: "background .4s" }} />
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full" style={{ border: `1px solid ${lit ? `${c}88` : LINE}`, background: `radial-gradient(circle, ${c}22, transparent 70%)` }}>
        <SystemIcon id={node.id} color={lit ? c : ICE} size={21} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[4px] leading-tight">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[16px] font-medium text-white">{node.label}</span>
          <span className="text-[10px] font-semibold tracking-[0.18em]" style={{ fontFamily: MONO, color: lit ? c : ICE_DIM }}>
            {TONE_LABEL[node.tone].toUpperCase()}
          </span>
        </span>
        <span className="truncate text-[14px]" style={{ color: lit ? "#f3f8fb" : "rgba(235,244,250,0.72)" }}>{node.activity ?? node.metric}</span>
        {node.gauge ? <Gauge value={node.gauge.value} total={node.gauge.total} color={lit ? c : ICE} /> : <span className="truncate text-[11.5px]" style={{ color: "rgba(169,200,216,0.5)" }}>{node.source}</span>}
      </span>
    </button>
  );
}

function InfoPanel({ id, onClose }: { id: keyof typeof SYSTEM_HELP; onClose: () => void }) {
  const help = SYSTEM_HELP[id];
  return (
    <div
      data-testid="system-panel"
      role="dialog"
      aria-label={help.title}
      className="sw-in pointer-events-auto absolute p-5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
      style={{ right: 58, bottom: 128, width: 460, background: "rgba(4,9,14,0.96)", border: `1px solid ${ICE}55` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[19px] font-medium">{help.title}</span>
        <button type="button" onClick={onClose} aria-label="Hinweis schließen" className="rounded-full px-3 py-1 text-[15px] text-white/60 hover:bg-white/10 hover:text-white">
          Schließen
        </button>
      </div>
      {help.lines.map((l) => (
        <p key={l} className="mt-1 text-[16px] leading-snug text-white/75">{l}</p>
      ))}
    </div>
  );
}

/** Arc of the tool ring as an SVG path (degrees, screen coordinates). */
function ringArc() {
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(RING.x + Math.cos(a) * RING.rx).toFixed(1)} ${(RING.y + Math.sin(a) * RING.ry).toFixed(1)}`;
  };
  return `M ${pt(RING.from - 6)} A ${RING.rx} ${RING.ry} 0 1 1 ${pt(RING.to + 6)}`;
}

/** Closed view: every tool as a small node on an arc around the head, with a spoke into it. */
function ToolRing({ spots }: { spots: ToolSpot[] }) {
  return (
    <g data-testid="deck-tool-ring">
      <path d={ringArc()} stroke={ICE} strokeOpacity=".16" strokeDasharray="1 7" fill="none" />
      <circle cx={HEAD.x} cy={HEAD.y} r={262} stroke={ICE} strokeOpacity=".08" fill="none" />
      <g className="sw-spin" style={{ transformOrigin: `${HEAD.x}px ${HEAD.y}px` }}>
        <circle cx={HEAD.x} cy={HEAD.y} r={262} stroke={ICE} strokeOpacity=".35" strokeWidth="1.2" strokeDasharray="60 760 18 808" fill="none" />
      </g>
      <g className="sw-spin rev" style={{ transformOrigin: `${HEAD.x}px ${HEAD.y}px` }}>
        <circle cx={HEAD.x} cy={HEAD.y} r={292} stroke={ICE} strokeOpacity=".12" strokeDasharray="2 12" fill="none" />
      </g>
      {spots.map((s) => {
        const c = toneColor(s.tone);
        const lit = s.tone !== "idle";
        const a = headAnchor(s);
        const lx = s.side === "left" ? s.x - 11 : s.side === "right" ? s.x + 11 : s.x;
        const ly = s.side === "top" ? s.y - 13 : s.y + 1;
        const anchor = s.side === "left" ? "end" : s.side === "right" ? "start" : "middle";
        return (
          <g key={s.tool} data-testid={`tool-spot-${s.tool}`} data-tone={s.tone}>
            <line x1={s.x} y1={s.y} x2={a.x} y2={a.y} stroke={c} strokeOpacity={lit ? 0.75 : 0.07} strokeWidth={lit ? 1.4 : 1} strokeDasharray={lit ? "6 6" : undefined} className={lit ? "sw-flow" : undefined} />
            {s.tone === "active" && <circle cx={s.x} cy={s.y} r={5} fill={c} className="sw-ping" />}
            <circle cx={s.x} cy={s.y} r={lit ? 4 : s.uses ? 3 : 2.4} fill={lit ? c : s.uses ? ICE_HI : ICE} fillOpacity={lit ? 1 : s.uses ? 0.85 : 0.45} />
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontFamily={MONO} fontSize="10.5" letterSpacing="1.4" fill={lit ? c : "rgba(200,225,238,0.5)"} fontWeight={lit ? 700 : 500}>
              {s.label.toUpperCase()}
              {s.uses > 0 && <tspan fill={lit ? c : ICE} fillOpacity={lit ? 1 : 0.75}>{`  ${s.uses}×`}</tspan>}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Links from Jarvis to every system row: dashed while quiet, solid and glowing while in use. */
function Links({ nodes, expanded }: { nodes: SystemNode[]; expanded: boolean }) {
  return (
    <g data-testid="deck-links">
      {expanded && (
        <>
          <circle cx={BODY.x} cy={BODY.y} r={330} stroke={ICE} strokeOpacity=".12" strokeDasharray="2 10" fill="none" />
          <circle cx={BODY.x} cy={BODY.y} r={92} fill="url(#sw-core)" className="sw-breathe" />
        </>
      )}
      {nodes.map((n) => {
        const d = linkPath(n, expanded ? BODY : headAnchor(n));
        const c = toneColor(n.tone);
        const lit = n.tone !== "idle";
        return (
          <g key={n.id}>
            {lit && <path d={d} stroke={c} strokeOpacity={0.3} strokeWidth={6} fill="none" filter="url(#sw-blur)" />}
            <path d={d} stroke={c} strokeOpacity={lit ? 0.95 : 0.26} strokeWidth={lit ? 1.6 : 1} strokeDasharray={lit ? undefined : "3 6"} fill="none" />
            <circle cx={n.x} cy={n.y} r={3} fill={lit ? c : ICE} fillOpacity={lit ? 1 : 0.5} />
          </g>
        );
      })}
    </g>
  );
}

/** Data pulses along the links (HTML + CSS motion path, no JS per frame). */
function Pulses({ nodes, expanded }: { nodes: SystemNode[]; expanded: boolean }) {
  return (
    <>
      {nodes.flatMap((n, i) => {
        const active = n.tone === "active";
        const count = active ? 3 : 1;
        const dur = active ? 1.5 : 4.2;
        const c = toneColor(n.tone);
        const path = linkPath(n, expanded ? BODY : headAnchor(n));
        return Array.from({ length: count }, (_, k) => (
          <span
            key={`${n.id}-${k}-${expanded ? "o" : "c"}`}
            className="sw-pulse"
            style={{
              offsetPath: `path("${path}")`,
              background: c,
              boxShadow: `0 0 12px 2px ${c}`,
              opacity: active ? 1 : n.tone === "idle" ? 0.45 : 0.8,
              animationDuration: `${dur}s`,
              animationDelay: `${-(i * 0.61 + (k * dur) / count)}s`,
              // active systems answer: every other pulse runs back to Jarvis
              animationDirection: active && k % 2 ? "reverse" : "normal",
            }}
          />
        ));
      })}
    </>
  );
}

export function SystemWatch({ expanded, onToggle }: Props) {
  const now = useNow(500);
  const dismissed = useUi((s) => s.dismissed);
  const workspaceOpen = useUi((s) => s.workspace !== null);
  const hiddenStageKey = useUi((s) => s.hiddenStageKey);
  const calm = useHud((s) => {
    if (stageMode(s, now, dismissed) === "call") return false;
    const item = stageItem(s, now, dismissed);
    const hidden = item?.key === hiddenStageKey && item.kind !== "cu" && item.kind !== "run" && !(item.kind === "approval" && item.approval.status === "pending");
    return hidden || stageMode(s, now, dismissed) === "calm";
  });
  const hud = useHud(useShallow((s) => ({ run: s.run, tools: s.tools, toolOrder: s.toolOrder, tasks: s.tasks, taskOrder: s.taskOrder, cu: s.cu })));
  const data = useAppData(useShallow((s) => ({ emails: s.emails, leads: s.leads, events: s.events, chat: s.chat, source: s.source })));
  const read = useMailDemo((s) => s.read);
  const crm = useCrmDemo((s) => s.state);
  const [panel, setPanel] = useState<keyof typeof SYSTEM_HELP | null>(null);

  const nodes = useMemo(() => summarizeSystems({ ...data, emails: data.emails.map((m) => read.includes(m.id) ? { ...m, unread: false } : m), leads: withOverrides(data.leads, crm), hud, now }), [data, read, crm, hud, now]);
  const spots = useMemo(() => toolRing(hud, now), [hud, now]);

  // native scenes (briefing, approval, agents, computer use, call) and app windows own the stage
  if (!calm || workspaceOpen) return null;

  const pick = (n: SystemNode) => {
    sfx.click();
    if (n.app) {
      setPanel(null);
      useUi.getState().openApp(n.app, n.app === "crm" ? desktopLead(data.leads)?.id : undefined);
      return;
    }
    const id = n.id;
    if (id === "team" || id === "computer" || id === "web") setPanel((p) => (p === id ? null : id));
  };
  const left = nodes.filter((n) => n.side === "left");
  const right = nodes.filter((n) => n.side === "right");
  const live = nodes.filter((n) => n.tone === "active").length;
  const world = Object.values(data.source).includes("live") ? "Testwelt" : "Demo-Daten";

  return (
    <div data-testid="system-watch" data-expanded={expanded ? "true" : "false"} className="pointer-events-none absolute inset-0 z-20" style={{ width: 1920, height: 1080 }}>
      <style>{CSS}</style>
      <svg key={expanded ? "open" : "closed"} className="sw-in absolute inset-0" width={1920} height={1080} viewBox="0 0 1920 1080" aria-hidden="true">
        <defs>
          <radialGradient id="sw-core">
            <stop offset="0" stopColor="#c1d8e3" stopOpacity=".4" />
            <stop offset=".5" stopColor="#759aaf" stopOpacity=".12" />
            <stop offset="1" stopColor="#759aaf" stopOpacity="0" />
          </radialGradient>
          <filter id="sw-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {!expanded && <ToolRing spots={spots} />}
        <Links nodes={nodes} expanded={expanded} />
      </svg>

      <Pulses nodes={nodes} expanded={expanded} />

      <Panel box={PANELS.systems} title="SYSTEME" meta={world} testId="deck-systems">
        {left.map((n, i) => <SystemRow key={n.id} node={n} index={i} height={ROW_H.systems} onPick={pick} />)}
      </Panel>
      <ActivityPanel box={PANELS.activity} now={now} />
      <Panel box={PANELS.network} title="SYSTEMNETZ" meta={live ? <span style={{ color: ACTIVE }}>{live} aktiv</span> : "6 Systeme"} delay={0.06} testId="deck-network">
        <div className="absolute left-0 right-0" style={{ top: PANEL_HEAD + 1 }}>
          <Globe nodes={nodes} width={PANELS.network.width - 2} height={PANELS.network.height - PANEL_HEAD - 3} />
        </div>
      </Panel>
      <Panel box={PANELS.reach} title="REICHWEITE" meta="Nur auf Auftrag" delay={0.18} testId="deck-reach">
        {right.map((n, i) => <SystemRow key={n.id} node={n} index={i} height={ROW_H.reach} onPick={pick} />)}
      </Panel>
      <VoicePanel box={PANELS.voice} />

      {panel && <InfoPanel id={panel} onClose={() => setPanel(null)} />}

      <button
        type="button"
        data-testid="watch-toggle"
        aria-pressed={expanded}
        onClick={() => {
          sfx.click();
          setPanel(null);
          onToggle();
        }}
        className="pointer-events-auto absolute flex items-center gap-3 px-5 text-[16px] text-white/90 transition-[background,box-shadow] duration-300 hover:bg-white/10"
        style={{
          right: 58,
          bottom: 46,
          height: 56,
          borderRadius: 999,
          border: `1px solid ${expanded ? "rgba(169,200,216,0.5)" : "rgba(169,200,216,0.22)"}`,
          background: expanded ? "rgba(117,154,175,0.14)" : "rgba(4,9,14,0.86)",
          boxShadow: expanded ? "0 0 30px rgba(169,200,216,0.16)" : "0 12px 40px rgba(0,0,0,0.3)",
        }}
      >
        <SystemIcon id="web" color={expanded ? ICE_HI : ICE} size={24} />
        {expanded ? "Zurück zu Jarvis" : "Systeme überwachen"}
      </button>
    </div>
  );
}
