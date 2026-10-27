"use client";
import { create } from "zustand";
import { CalendarEvent, ChatMessage, Email, Lead, type JarvisEvent } from "@jarvis/contracts";
import { demoData, type AppData } from "./fixtures";

// The thin data layer behind the app windows: records come live from services/mock-world
// (REST, CORS open) and fall back to the demo data per collection when it is not reachable.
// While agents work the snapshot is frozen: the orchestrator writes into the mock world as the
// run goes, and a refetch would show the result before the HUD has played the action.

export const MOCK_WORLD_URL = process.env.NEXT_PUBLIC_MOCK_WORLD_URL ?? "http://localhost:8700";
export const CHANNELS = ["allgemein", "vertrieb", "delivery"] as const;
const TIMEOUT_MS = 1500;

export type Source = "live" | "demo";
type Collection = keyof AppData;

type DataStore = AppData & {
  source: Record<Collection, Source>;
  frozen: boolean;
  loadedAt: number;
};

export const useAppData = create<DataStore>()(() => ({
  ...demoData(),
  source: { emails: "demo", events: "demo", leads: "demo", chat: "demo" },
  frozen: false,
  loadedAt: 0,
}));

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

type Schema<T> = { safeParse: (x: unknown) => { success: true; data: T } | { success: false } };

async function getJson<T>(fetcher: Fetch, path: string, schema: Schema<T>): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(`${MOCK_WORLD_URL}${path}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Loads one or all collections; anything that fails keeps what is there (demo or older live data). */
export async function loadAppData(only?: Collection[], fetcher: Fetch = (i, init) => globalThis.fetch(i, init)): Promise<void> {
  if (MOCK_WORLD_URL === "off" || useAppData.getState().frozen) return;
  const want = (c: Collection) => !only || only.includes(c);
  const [emails, events, leads, chat] = await Promise.all([
    want("emails") ? getJson(fetcher, "/api/emails?limit=60", Email.array()) : null,
    want("events") ? getJson(fetcher, "/api/events", CalendarEvent.array()) : null,
    want("leads") ? getJson(fetcher, "/api/leads", Lead.array()) : null,
    want("chat") ? Promise.all(CHANNELS.map((c) => getJson(fetcher, `/api/chat?channel=${c}`, ChatMessage.array()))) : null,
  ]);
  // a run may have started while we were waiting
  if (useAppData.getState().frozen) return;
  useAppData.setState((s) => {
    const next: Partial<DataStore> = { source: { ...s.source }, loadedAt: Date.now() };
    if (emails) (next.emails = emails), (next.source!.emails = "live");
    if (events) (next.events = events), (next.source!.events = "live");
    if (leads) (next.leads = leads), (next.source!.leads = "live");
    if (chat && chat.every(Boolean)) {
      next.chat = Object.fromEntries(CHANNELS.map((c, i) => [c, chat[i]!]));
      next.source!.chat = "live";
    }
    return next;
  });
}

export function freezeAppData(frozen: boolean) {
  clearTimeout(thawTimer);
  useAppData.setState({ frozen });
}

// The snapshot is frozen from the first agent until a while after the punchline. Every agent
// event re-arms a safety thaw, so a run that never sends run.summary cannot freeze it for good.
export const FREEZE = { afterSummaryMs: 12_000, safetyMs: 45_000 };
let thawTimer: ReturnType<typeof setTimeout> | undefined;

function freezeFor(ms: number) {
  clearTimeout(thawTimer);
  useAppData.setState({ frozen: true });
  thawTimer = setTimeout(() => {
    useAppData.setState({ frozen: false });
    void loadAppData();
  }, ms);
}

/** Keeps the app windows' data in step with the event stream (wired up once in HudApp). */
export function appDataOnEvent(e: JarvisEvent) {
  switch (e.type) {
    case "run.planned":
      // nothing is written before the plan is approved: refresh, the first agent freezes
      void loadAppData();
      return;
    case "agent.spawned":
    case "agent.action":
      freezeFor(FREEZE.safetyMs);
      return;
    case "run.summary":
      freezeFor(FREEZE.afterSummaryMs);
      return;
    case "notice":
      if (e.payload.entity === "mail") void loadAppData(["emails"]);
      return;
    case "briefing.item":
      if (e.payload.index === 0) void loadAppData();
      return;
  }
}

/** Back to the demo data (R = reset between rehearsals), then live data where available. */
export async function resetAppData(fetcher?: Fetch) {
  clearTimeout(thawTimer);
  useAppData.setState({ ...demoData(), source: { emails: "demo", events: "demo", leads: "demo", chat: "demo" }, frozen: false });
  await loadAppData(undefined, fetcher);
}
