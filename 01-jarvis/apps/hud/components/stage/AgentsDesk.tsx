"use client";
import { memo, useMemo } from "react";
import { motion } from "motion/react";
import { useHud } from "@/lib/events/store";
import { useNow } from "@/lib/hooks";
import { AGENT_LOOK, agentDone, runAgents, schedule, type AgentApp, type Played } from "@/lib/agents";
import { MailApp, type AgentLook } from "../apps/MailApp";
import { CalendarApp } from "../apps/CalendarApp";
import { ChatApp } from "../apps/ChatApp";
import { CrmApp } from "../apps/CrmApp";
import { GenericApp } from "../apps/GenericApp";
import { agentRects, type OrbPose, type Rect } from "./layout";

// Bild A: one real-looking app window per agent. The windows fly out of the sphere, light
// beams show who is working, and when the run is over they fly back into it (exit variant).

const EMPTY: Played[] = [];
const APPS: Record<AgentApp, React.ComponentType<{ played: Played[]; agent?: AgentLook }>> = {
  mail: MailApp,
  calendar: CalendarApp,
  chat: ChatApp,
  crm: CrmApp,
  praxis: GenericApp,
};

type Custom = { dx: number; dy: number; i: number; back: { dx: number; dy: number } };

const windowVariants = {
  hidden: (c: Custom) => ({ x: c.dx, y: c.dy, scale: 0.12, opacity: 0 }),
  shown: (c: Custom) => ({ x: 0, y: 0, scale: 1, opacity: 1, transition: { type: "spring" as const, stiffness: 120, damping: 19, mass: 0.9, delay: 0.08 + c.i * 0.09 } }),
  gone: (c: Custom) => ({ x: c.back.dx, y: c.back.dy, scale: 0.08, opacity: 0, transition: { duration: 0.6, ease: [0.55, 0, 0.75, 0.2] as const, delay: c.i * 0.05 } }),
};

const center = (r: Rect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export function AgentsDesk({ orb, back }: { orb: OrbPose; back: OrbPose }) {
  const run = useHud((s) => s.run);
  const now = useNow(300);
  const played = useMemo(() => (run ? schedule(run.actions) : new Map<string, Played[]>()), [run?.actions]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!run) return null;
  const agents = runAgents(run);
  const rects = agentRects(agents);

  return (
    <motion.div
      data-testid="agents-desk"
      data-agents={agents.length}
      className="pointer-events-none absolute inset-0"
      initial="hidden"
      animate="shown"
      exit="gone"
      variants={{ hidden: {}, shown: {}, gone: { transition: { when: "afterChildren" } } }}
    >
      <Beams orb={orb} beams={agents.flatMap((a) => (rects[a.agentId] ? [{ id: a.agentId, color: AGENT_LOOK[a.app].color, to: center(rects[a.agentId]!), on: !agentDone(run, a.agentId, now) }] : []))} />
      {agents.map((a, i) => {
        const r = rects[a.agentId];
        if (!r) return null;
        const c = center(r);
        const custom: Custom = { dx: orb.cx - c.x, dy: orb.cy - c.y, i, back: { dx: back.cx - c.x, dy: back.cy - c.y } };
        return (
          <motion.div key={a.agentId} custom={custom} variants={windowVariants} className="pointer-events-auto absolute" style={{ left: r.left, top: r.top, width: r.width, height: r.height, zIndex: 5 }}>
            <AgentWindow app={a.app} played={played.get(a.agentId) ?? EMPTY} done={agentDone(run, a.agentId, now)} />
          </motion.div>
        );
      })}
    </motion.div>
  );
}

const AgentWindow = memo(function AgentWindow({ app, played, done }: { app: AgentApp; played: Played[]; done: boolean }) {
  const App = APPS[app];
  const look = useMemo<AgentLook>(() => ({ color: AGENT_LOOK[app].color, label: AGENT_LOOK[app].agent, done }), [app, done]);
  return <App played={played} agent={look} />;
});

type Beam = { id: string; color: string; to: { x: number; y: number }; on: boolean };

/** Light from the sphere to every window whose agent still works (under the windows, like the mockup). */
function Beams({ orb, beams }: { orb: OrbPose; beams: Beam[] }) {
  return (
    <>
      {beams.map((b, i) => {
        const dx = b.to.x - orb.cx;
        const dy = b.to.y - orb.cy;
        const len = Math.hypot(dx, dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const start = Math.min(0.9, (orb.r * 0.95) / len) * 100;
        return (
          <motion.div
            key={b.id}
            data-testid="agent-beam"
            data-on={b.on || undefined}
            className="absolute overflow-hidden"
            style={{ left: orb.cx, top: orb.cy - 2, width: len, height: 4, transformOrigin: "0 50%", rotate: angle, zIndex: 4 }}
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: b.on ? 1 : 0, scaleX: 1 }}
            transition={{ duration: 0.7, delay: 0.25 + i * 0.09, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.8 } }}
          >
            <span className="absolute inset-0" style={{ background: `linear-gradient(90deg, transparent ${start}%, rgba(255,201,163,0.25) ${start + 3}%, rgba(255,201,163,0.95))`, boxShadow: "0 0 16px rgba(255,201,163,0.75)" }} />
            <span
              className="beam-flow absolute bottom-0 top-0 w-[160px]"
              style={{ background: `linear-gradient(90deg, transparent, ${b.color}, #fff, transparent)`, animationDelay: `${i * 0.37}s`, ["--from" as string]: `${(start / 100) * len}px`, ["--to" as string]: `${len}px` }}
            />
          </motion.div>
        );
      })}
    </>
  );
}
