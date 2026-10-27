// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MailApp } from "@/components/apps/MailApp";
import { useMailDemo } from "@/lib/apps/mailDemo";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const q = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (host: HTMLElement, id: string) => act(async () => q(host, id)!.click());
const settle = (ms = 50) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
// React tracks the value property; set it the native way so onChange fires
function type(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

let cleanup: (() => Promise<void>) | null = null;
async function mount(props: Partial<Parameters<typeof MailApp>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<MailApp played={[]} interactive {...props} />));
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  return host;
}

describe("MailApp interactive", () => {
  beforeEach(() => useMailDemo.getState().actions.reset());
  afterEach(async () => {
    await cleanup?.();
    cleanup = null;
  });

  it("stays the agent playback window unless asked to be interactive", async () => {
    const host = await mount({ interactive: false });
    expect(q(host, "app-mail")).not.toBeNull();
    expect(q(host, "mail-interactive")).toBeNull();
  });

  it("writes a new mail, sends it and shows it in the sent folder with a confirmation", async () => {
    const host = await mount();
    await click(host, "mail-new");
    expect(q(host, "mail-compose")).not.toBeNull();
    await act(async () => {
      type(q(host, "mail-to")!, "mara.schulz@leos-agentur.example");
      type(q(host, "mail-subject")!, "Probe für das Video");
      type(q(host, "mail-body")!, "Hallo Mara, die Demo läuft.");
    });
    await click(host, "mail-send");
    expect(q(host, "mail-sent-confirmation")?.textContent).toContain("Gesendet an Mara Schulz");
    expect(q(host, "mail-folder-sent")?.textContent).toContain("1");
    await click(host, "mail-folder-sent");
    expect(q(host, "mail-sent-row-S-1")?.textContent).toContain("Probe für das Video");
    expect(q(host, "mail-sent-view")?.textContent).toContain("Hallo Mara, die Demo läuft.");
  });

  it("keeps sent mail after close and reopen", async () => {
    let host = await mount();
    await click(host, "mail-row-M-101");
    await click(host, "mail-reply");
    await act(async () => type(q(host, "mail-body")!, "Passt, bis gleich."));
    await click(host, "mail-send");
    await cleanup!();

    host = await mount();
    expect(q(host, "mail-row-M-101")?.querySelector("svg")).not.toBeNull();
    await click(host, "mail-folder-sent");
    expect(q(host, "mail-sent-row-S-1")?.textContent).toContain("Re: Unterschrift heute möglich?");
  });

  it("types the Jarvis reply visibly and stops for good when the window closes", async () => {
    const host = await mount();
    await click(host, "mail-row-M-101");
    await click(host, "mail-reply-ai");
    await settle(120);
    const partial = (q(host, "mail-body") as HTMLTextAreaElement).value;
    expect(partial.length).toBeGreaterThan(0);
    expect("Hallo Herr Müller,".startsWith(partial.slice(0, 18))).toBe(true);
    await cleanup!();
    cleanup = null;
    const atClose = useMailDemo.getState().compose!;
    expect(atClose.ai).toBeNull();
    await new Promise((r) => setTimeout(r, 120));
    expect(useMailDemo.getState().compose!.body).toBe(atClose.body);
  });

  it("shortcut keys typed into the mail do not reach the HUD", async () => {
    const host = await mount();
    await click(host, "mail-new");
    let leaked = 0;
    const spy = () => leaked++;
    window.addEventListener("keydown", spy);
    q(host, "mail-body")!.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
    window.removeEventListener("keydown", spy);
    expect(leaked).toBe(0);
  });

  it("search lives in the shared store, so the reading pane matches the visible mail", async () => {
    const host = await mount();
    await act(async () => type(q(host, "mail-search")!, "Rechnung"));
    expect(useMailDemo.getState().query).toBe("Rechnung");
    expect(q(host, "mail-reading")!.textContent).toContain("Rechnung #2026-114");
  });

  it("a prefilled offer mail shows in the editor and the old draft counts as a draft", async () => {
    const host = await mount();
    await click(host, "mail-new");
    await act(async () => type(q(host, "mail-body")!, "angefangen"));
    await act(async () => useMailDemo.getState().actions.prefill({ to: "a@b.example", subject: "Angebot", body: "Text" }));
    expect((q(host, "mail-subject") as HTMLInputElement).value).toBe("Angebot");
    expect(host.textContent).toMatch(/Entwürfe2/);
  });
});
