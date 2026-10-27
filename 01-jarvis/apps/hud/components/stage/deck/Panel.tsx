"use client";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useHud } from "@/lib/events/store";
import { useVoiceSession } from "@/lib/voice";
import { activityFeed, clock, timelineTicks, type Box } from "@/lib/avatar/deck";
import { ACTIVE, ICE, ICE_DIM, ICE_HI, LINE, MONO, PANEL_BG, logColor } from "./palette";
import { Waveform } from "./Waveform";

/** Hairline frame with corner ticks and a small mono header, like a technical instrument. */
export function Panel({ box, title, meta, delay = 0, testId, children }: { box: Box; title: string; meta?: ReactNode; delay?: number; testId?: string; children: ReactNode }) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className="sw-in pointer-events-auto absolute"
      style={{ ...box, background: PANEL_BG, border: `1px solid ${LINE}`, animationDelay: `${delay}s` }}
    >
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <i
          key={c}
          aria-hidden="true"
          className="absolute block h-[9px] w-[9px]"
          style={{
            [c[0] === "t" ? "top" : "bottom"]: -1,
            [c[1] === "l" ? "left" : "right"]: -1,
            borderColor: "rgba(169,200,216,0.7)",
            borderStyle: "solid",
            borderWidth: `${c[0] === "t" ? 1 : 0}px ${c[1] === "r" ? 1 : 0}px ${c[0] === "b" ? 1 : 0}px ${c[1] === "l" ? 1 : 0}px`,
          }}
        />
      ))}
      <header className="flex h-[40px] items-center justify-between px-[14px]" style={{ fontFamily: MONO }}>
        <span className="flex items-center gap-[9px] text-[11px] font-semibold tracking-[0.22em]" style={{ color: ICE }}>
          <i className="block h-[5px] w-[5px]" style={{ background: ICE, boxShadow: `0 0 8px ${ICE}` }} />
          {title}
        </span>
        {meta != null && <span className="truncate pl-3 text-[11px] tracking-[0.08em]" style={{ color: ICE_DIM }}>{meta}</span>}
      </header>
      <i aria-hidden="true" className="absolute left-0 right-0 top-[40px] block h-px" style={{ background: "linear-gradient(90deg, rgba(169,200,216,0.32), rgba(169,200,216,0.06))" }} />
      {children}
    </section>
  );
}

/** What happened in this session: running tool calls, then the reducer's log, plus a 5-minute time axis. */
export function ActivityPanel({ box, now }: { box: Box; now: number }) {
  // every event bumps the count, so this re-renders on new activity; `now` moves the time axis
  const count = useHud((s) => s.eventCount);
  const s = useHud.getState();
  const entries = activityFeed(s, now, 8);
  const marks = timelineTicks(s.log, now);
  return (
    <Panel box={box} title="AKTIVITÄT" meta={`${count} Ereignisse`} delay={0.12} testId="deck-activity">
      <ol className="absolute left-0 right-0 top-[48px] px-[14px]" style={{ bottom: 88 }} data-testid="deck-feed">
        {entries.length === 0 && (
          <li className="pt-[10px] text-[14px] leading-snug text-white/45">Noch keine Aktivität in dieser Sitzung. Jede Abfrage von Jarvis erscheint hier.</li>
        )}
        {entries.map((e, i) => (
          <li key={e.id} className="sw-feed flex h-[44px] items-center gap-[10px] border-b" style={{ borderColor: "rgba(169,200,216,0.07)", opacity: 1 - i * 0.07 }}>
            <span className="w-[62px] shrink-0 text-[11px] tabular-nums" style={{ fontFamily: MONO, color: ICE_DIM }}>{clock(e.at)}</span>
            <span className="relative flex h-[7px] w-[7px] shrink-0">
              {e.live && <span className="sw-ping absolute inset-0 rounded-full" style={{ background: ACTIVE }} />}
              <span className="relative h-[7px] w-[7px] rounded-full" style={{ background: e.live ? ACTIVE : logColor(e.tone), boxShadow: `0 0 8px ${e.live ? ACTIVE : logColor(e.tone)}` }} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[14px]" style={{ color: e.live ? "#ffe2c4" : "rgba(235,244,250,0.86)" }}>{e.text}</span>
              {e.meta && <span className="truncate text-[10.5px] tracking-[0.04em]" style={{ fontFamily: MONO, color: "rgba(169,200,216,0.5)" }}>{e.meta}</span>}
            </span>
          </li>
        ))}
      </ol>
      <div className="absolute left-[14px] right-[14px] bottom-[14px] h-[62px]" data-testid="deck-timeline" style={{ fontFamily: MONO }}>
        <div className="flex justify-between text-[10px] tracking-[0.18em]" style={{ color: ICE_DIM }}>
          <span>ZEITACHSE · 5 MIN</span>
          <span style={{ color: ICE }}>JETZT</span>
        </div>
        <div className="absolute bottom-[8px] left-0 right-0 h-[30px]">
          <i className="absolute bottom-0 left-0 right-0 block h-px" style={{ background: LINE }} />
          {[0, 0.2, 0.4, 0.6, 0.8].map((x) => (
            <i key={x} className="absolute bottom-0 block h-[5px] w-px" style={{ left: `${x * 100}%`, background: "rgba(169,200,216,0.3)" }} />
          ))}
          {marks.map((m) => (
            <i key={m.id} className="absolute bottom-0 block w-[2px] rounded-full" style={{ left: `calc(${m.x * 100}% - 1px)`, height: 18, background: logColor(m.tone), boxShadow: `0 0 6px ${logColor(m.tone)}`, transition: "left 1s linear" }} />
          ))}
          <i className="sw-now absolute bottom-0 right-0 block h-[26px] w-px" style={{ background: ICE_HI, boxShadow: `0 0 8px ${ICE_HI}` }} />
        </div>
      </div>
    </Panel>
  );
}

const VOICE_LABEL = { idle: "Bereit", listening: "Hört zu", thinking: "Denkt nach", speaking: "Spricht", acting: "Arbeitet" } as const;
const CONN_LABEL = { open: "Live", connecting: "Verbinde", reconnecting: "Getrennt", closed: "Getrennt" } as const;

/** Voice: the live waveform, the measured time to first audio and the state of mic and event stream. */
export function VoicePanel({ box }: { box: Box }) {
  const v = useVoiceSession();
  const { state, last, history, conn } = useHud(useShallow((s) => ({ state: s.voice.state, last: s.latency.last, history: s.latency.history, conn: s.connection.state })));
  const meta = v.state === "connected" ? VOICE_LABEL[state] : v.state === "connecting" ? "Verbinde …" : "Nicht verbunden";
  return (
    <Panel box={box} title="STIMME" meta={<span style={{ color: state === "speaking" || state === "listening" ? ICE_HI : undefined }}>{meta}</span>} delay={0.24} testId="deck-voice">
      <div className="absolute left-[14px] right-[14px] top-[52px]">
        <Waveform width={box.width - 30} height={64} />
      </div>
      <dl className="absolute bottom-[14px] left-[14px] right-[14px] grid grid-cols-3 gap-[10px]" style={{ fontFamily: MONO }}>
        <Readout label="ERSTES AUDIO" value={last != null ? `${Math.round(last)} ms` : "–"} extra={<Spark values={history} />} />
        <Readout label="MIKROFON" value={v.muted ? "Stumm" : v.state === "connected" ? "Offen" : "Aus"} />
        <Readout label="EREIGNISSE" value={CONN_LABEL[conn]} tone={conn === "open" ? "ok" : "warn"} />
      </dl>
    </Panel>
  );
}

function Readout({ label, value, extra, tone }: { label: string; value: string; extra?: ReactNode; tone?: "ok" | "warn" }) {
  return (
    <div className="flex flex-col gap-[4px] border-l pl-[9px]" style={{ borderColor: LINE }}>
      <dt className="text-[9.5px] tracking-[0.18em]" style={{ color: ICE_DIM }}>{label}</dt>
      <dd className="flex items-end gap-[6px] whitespace-nowrap text-[17px] font-light tabular-nums" style={{ color: tone === "warn" ? ACTIVE : ICE_HI, fontFamily: "var(--font-sans)" }}>
        {value}
        {extra}
      </dd>
    </div>
  );
}

/** Tiny sparkline of the measured first-audio latencies (only real metrics.latency events). */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 34).toFixed(1)},${(14 - (v / max) * 12).toFixed(1)}`).join(" ");
  return (
    <svg width="26" height="15" viewBox="0 0 34 15" aria-hidden="true" className="mb-[3px]">
      <polyline points={pts} fill="none" stroke={ICE} strokeOpacity=".7" strokeWidth="1" />
    </svg>
  );
}
