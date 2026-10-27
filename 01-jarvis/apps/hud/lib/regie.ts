"use client";
import { ORCHESTRATOR_URL, SESSION_ID } from "@/lib/voice/elevenlabs/tools";
import { useHud } from "@/lib/events/store";
import { resetAppData } from "@/lib/apps/data";
import { useUi } from "@/lib/ui";

// Director keys (demo/BEISPIEL-ABLAUF.md, "Absicherung"): invisible to the audience, confirmed only in
// the explain bar. Every key calls the orchestrator's rehearsal endpoint; tools/mock-events
// answers the same endpoints.

export const CU_INSTRUCTION = "Lege für Dr. Anna Weber in PraxisPilot einen Testtermin am Dienstag um 10:00 Uhr an, Grund: Test KI-Empfang";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

type Key = { label: string; fail: string; path: string; body?: unknown; local?: () => Promise<void> };

async function resetLocal() {
  useHud.getState().reset();
  await resetAppData();
}

export const REGIE: Record<string, Key> = {
  r: { label: "Zurückgesetzt", fail: "Reset nur im HUD", path: "/demo/reset", local: resetLocal },
  n: { label: "Mitteilung ausgelöst", fail: "Mitteilung fehlgeschlagen", path: "/demo/notice/urgent-mail" },
  m: { label: "Müller-Lauf gestartet", fail: "Müller-Lauf fehlgeschlagen", path: "/demo/run/mueller" },
  c: { label: "Computer Use gestartet", fail: "Computer Use fehlgeschlagen", path: "/tools/start_computer_task", body: { instruction: CU_INSTRUCTION } },
};

export async function runRegie(key: string, fetcher: Fetch = (i, init) => globalThis.fetch(i, init)): Promise<string> {
  const r = REGIE[key.toLowerCase()];
  if (!r) return "";
  let text: string;
  try {
    const sep = r.path.includes("?") ? "&" : "?";
    const res = await fetcher(`${ORCHESTRATOR_URL}${r.path}${sep}sessionId=${encodeURIComponent(SESSION_ID)}`, {
      method: "POST",
      ...(r.body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(r.body) } : {}),
    });
    text = res.ok ? r.label : `${r.fail}: HTTP ${res.status}`;
  } catch {
    text = `${r.fail}: Orchestrator nicht erreichbar`;
  }
  // the reset clears the HUD even when the orchestrator is down
  await r.local?.();
  useUi.getState().setRegie(text);
  return text;
}
