"use client";
import { motion, AnimatePresence } from "motion/react";
import type { StageItem } from "@/lib/stage";
import { EASE, stageRect } from "./layout";
import { useHud } from "@/lib/events/store";
import type { Approval } from "@/lib/events/reducer";
import { ApprovalContent, FocusContent, LearnedContent, PlanContent, WidgetContent } from "./contents";

/** The plan of a multi-agent run is answered like any approval, but shown as its steps. */
function ApprovalOrPlan({ approval, compact }: { approval: Approval; compact: boolean }) {
  const run = useHud((s) => (s.run?.approvalId === approval.approvalId ? s.run : null));
  return run ? <PlanContent approval={approval} run={run} compact={compact} /> : <ApprovalContent approval={approval} />;
}

const PAD = { x: 58, y: 46 }; // 3cqw, 2.4cqw

export type PanelItem = Exclude<StageItem, { kind: "cu" | "run" | "briefing" }>;

/** The one stage beside Jarvis: dark milk glass, eyebrow + statement + evidence. */
export function StagePanel({ item, explain }: { item: PanelItem | null; explain: boolean }) {
  const rect = stageRect(explain);
  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key="stage"
          data-testid="stage-panel"
          data-kind={item.kind}
          className="absolute overflow-hidden"
          style={{
            left: rect.left,
            width: rect.width,
            borderRadius: 31,
            background: "rgba(12,14,32,0.62)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6)",
          }}
          initial={{ opacity: 0, scale: 0.97, x: -24, top: rect.top, height: rect.height }}
          animate={{ opacity: 1, scale: 1, x: 0, top: rect.top, height: rect.height }}
          exit={{ opacity: 0, scale: 0.98, x: -16, transition: { duration: 0.45, ease: EASE } }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={item.key}
              className="absolute inset-0 flex flex-col"
              style={{ padding: `${PAD.y}px ${PAD.x}px` }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <Content item={item} height={rect.height - PAD.y * 2} width={rect.width - PAD.x * 2} explain={explain} />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Content({ item, height, width, explain }: { item: PanelItem; height: number; width: number; explain: boolean }) {
  switch (item.kind) {
    case "widget":
      return <WidgetContent widget={item.widget} height={height} width={width} />;
    case "focus":
      return <FocusContent focus={item.focus} />;
    case "approval":
      return <ApprovalOrPlan approval={item.approval} compact={explain} />;
    case "learned":
      return <LearnedContent learned={item.learned} />;
  }
}
