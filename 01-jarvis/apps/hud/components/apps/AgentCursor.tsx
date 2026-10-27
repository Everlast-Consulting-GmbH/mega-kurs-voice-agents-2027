"use client";
import { useLayoutEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

// A coloured pointer with the agent's name, like a collaborator in a shared document. It
// glides to the element marked data-t="<target>" inside its window; while dragging it moves
// in a straight, timed line with the card it carries.

type Props = {
  rootRef: React.RefObject<HTMLDivElement | null>;
  target: string | null;
  color: string;
  label: string;
  /** seconds: move in a timed line (drag) instead of the spring */
  drag?: number;
  /** changes on every click; draws a ripple at the tip */
  click?: string | number | null;
  /** re-measure when the target element may have moved */
  version?: string | number;
  done?: boolean;
};

const SPRING = { type: "spring", stiffness: 150, damping: 22, mass: 0.9 } as const;

function measure(root: HTMLDivElement, target: string): { x: number; y: number } | null {
  const el = root.querySelector<HTMLElement>(`[data-t="${CSS.escape(target)}"]`);
  if (!el) return null;
  const r = root.getBoundingClientRect();
  const k = r.width / (root.offsetWidth || 1) || 1;
  const e = el.getBoundingClientRect();
  const fx = Number(el.dataset.tx ?? 0.5);
  const fy = Number(el.dataset.ty ?? 0.55);
  return { x: (e.left - r.left + e.width * fx) / k, y: (e.top - r.top + e.height * fy) / k };
}

export function AgentCursor({ rootRef, target, color, label, drag, click, version, done }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const at = target ? measure(root, target) : null;
    // first appearance: from the lower middle of the window, as if it came from Jarvis
    setPos((p) => at ?? p ?? { x: root.offsetWidth * 0.5, y: root.offsetHeight * 0.75 });
  }, [rootRef, target, version]);

  if (!pos) return null;
  // near the right edge the name tag goes left of the pointer, so it stays inside the window
  const flip = pos.x > (rootRef.current?.offsetWidth ?? Infinity) - 170;
  return (
    <motion.div
      data-testid="agent-cursor"
      data-target={target ?? ""}
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: 30 }}
      initial={{ x: pos.x, y: pos.y + 40, opacity: 0 }}
      animate={{ x: pos.x, y: pos.y, opacity: done ? 0 : 1 }}
      transition={drag ? { type: "tween", ease: [0.45, 0, 0.25, 1], duration: drag, opacity: { duration: 0.4 } } : { ...SPRING, opacity: { duration: 0.4 } }}
    >
      <AnimatePresence>
        {click != null && (
          <motion.span
            key={String(click)}
            className="absolute rounded-full"
            style={{ left: -16, top: -16, width: 32, height: 32, border: `2.5px solid ${color}` }}
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 1.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
      <svg width="27" height="27" viewBox="0 0 24 24" className="absolute" style={{ left: -3, top: -2, filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.35))" }}>
        <path d="M3 2l17 9-7.5 2L9 21z" fill={color} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <span
        className="absolute whitespace-nowrap rounded-[7px] px-[9px] py-[3px] text-[14px] font-medium text-white"
        style={{ ...(flip ? { right: 8 } : { left: 19 }), top: 21, background: color, boxShadow: "0 4px 12px rgba(0,0,0,0.25)" }}
      >
        {label}
      </span>
    </motion.div>
  );
}
