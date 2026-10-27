// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { makeEvent } from "@jarvis/contracts";
import { useHud } from "@/lib/events/store";
import { useUi } from "@/lib/ui";
import { useAppData } from "@/lib/apps/data";
import { demoData } from "@/lib/apps/fixtures";
import { useMailDemo } from "@/lib/apps/mailDemo";
import { useCrmDemo } from "@/lib/apps/crmDemo";
import { SystemWatch } from "@/components/stage/SystemWatch";

vi.mock("@/lib/sound/sfx", () => ({ sfx: { click: () => {} } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let toggles = 0;
const render = (expanded: boolean) => act(() => root.render(createElement(SystemWatch, { expanded, onToggle: () => void toggles++ })));
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeEach(() => {
  useHud.getState().reset();
  toggles = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("SystemWatch", () => {
  it("renders the toggle and all six nodes in both views", () => {
    for (const expanded of [false, true]) {
      render(expanded);
      expect(q("system-watch")?.dataset.expanded).toBe(String(expanded));
      for (const id of ["mail", "crm", "calendar", "web", "computer", "team"]) expect(q(`system-node-${id}`)).not.toBeNull();
      expect(q("watch-toggle")?.textContent).toBe(expanded ? "Zurück zu Jarvis" : "Systeme überwachen");
    }
    act(() => q("watch-toggle")!.click());
    expect(toggles).toBe(1);
  });

  it("opens the app window for mail and shows help for web", () => {
    render(true);
    act(() => q("system-node-web")!.click());
    expect(q("system-panel")?.textContent).toContain("Kein Dauerzugriff");
    act(() => q("system-node-mail")!.click());
    expect(useUi.getState().workspace).toEqual({ app: "mail" });
    // an open app window owns the stage
    expect(q("system-watch")).toBeNull();
  });

  it("reflects local read receipts and closed deals after returning to the deck", () => {
    const data = demoData();
    useAppData.setState(data);
    render(false);
    const unread = data.emails.filter((m) => m.folder === "inbox" && m.unread);
    act(() => unread.forEach((m) => useMailDemo.getState().actions.focus(m.id)));
    expect(q("system-node-mail")?.textContent).toContain(`${data.emails.filter((m) => m.folder === "inbox").length} Mails`);
    expect(q("system-node-mail")?.textContent).not.toContain("ungelesen");
    const open = data.leads.filter((l) => !["gewonnen", "verloren"].includes(l.status));
    act(() => open.forEach((lead) => useCrmDemo.getState().dispatch({ type: "move", lead, to: "gewonnen" })));
    expect(q("system-node-crm")?.textContent).toContain(`0 von ${data.leads.length} Leads offen`);
  });

  it("steps aside while a native scene (approval) is on stage", () => {
    act(() => useHud.getState().apply(makeEvent("approval.requested", { approvalId: "a1", title: "Mail senden", detail: "x", risk: "medium" })));
    render(false);
    expect(q("system-watch")).toBeNull();
  });
});
