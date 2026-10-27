import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import path from "node:path";

test.use({ video: { mode: "on", size: { width: 1920, height: 1080 } } });

const port = Number(process.env.MOCK_PORT ?? 8797);
let mock: ChildProcess | null = null;
const portOpen = () => new Promise<boolean>((resolve) => {
  const socket = connect(port, "127.0.0.1");
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => { socket.destroy(); resolve(false); });
});
test.beforeAll(async () => {
  if (await portOpen()) throw new Error(`Mock port ${port} is busy`);
  mock = spawn("pnpm", ["--filter", "@jarvis/mock-events", "start"], { cwd: path.resolve(process.cwd(), "../.."), detached: true, stdio: "ignore", env: { ...process.env, PORT: String(port) } });
  await expect.poll(portOpen, { timeout: 20_000 }).toBe(true);
});
test.afterAll(() => { if (mock?.pid) process.kill(-mock.pid, "SIGTERM"); });

test("CRM, Angebot, Mail und Einladung bilden eine konsistente Demo-Strecke", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toHaveAttribute("data-tone", "live");
  await page.getByTestId("dock-crm").click();
  await expect(page.getByTestId("crm-detail")).toContainText("Müller GmbH");
  const dockBox = await page.getByTestId("app-dock").boundingBox();
  const workspaceBox = await page.getByTestId("desktop-workspace").boundingBox();
  expect(dockBox!.x + dockBox!.width).toBeLessThan(workspaceBox!.x);
  await page.getByTestId("crm-advance").click();
  await page.getByTestId("desktop-quick-question").click();
  await expect(page.getByTestId("desktop-answer")).toContainText("Verhandlung");
  await page.getByTestId("crm-offer").click();
  await expect(page.getByTestId("offer-app")).toContainText("84.000");
  await page.locator('select[aria-label="Lead wählen"]').selectOption("L-002");
  await page.getByTestId("desktop-quick-question").click();
  await expect(page.getByTestId("desktop-answer")).toContainText("Hansa Kliniken");
  await expect(page.getByTestId("desktop-answer")).toContainText("120.000");
  await page.locator('select[aria-label="Lead wählen"]').selectOption("L-001");
  await expect(page.getByTestId("offer-totals")).toHaveCSS("opacity", "1");
  const pdf = page.waitForEvent("popup");
  await page.getByTestId("offer-pdf").click();
  const doc = await pdf;
  await expect(doc.locator("body")).toContainText("Müller GmbH");
  await doc.close();
  await expect(page.getByTestId("offer-document").locator("header")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "evidence/action-offer.png" });
  await page.getByTestId("offer-mail").click();
  await expect(page.getByTestId("mail-subject")).toHaveValue(/Angebot/);
  await page.getByTestId("mail-invite").click();
  await expect(page.getByTestId("mail-invite-card")).toBeVisible();
  await page.getByTestId("desktop-quick-question").click();
  await expect(page.getByTestId("desktop-answer")).toContainText("noch nicht gesendet");
  await page.getByTestId("mail-body").focus();
  await page.keyboard.type(" R M C");
  await expect(page.getByTestId("desktop-workspace")).toHaveAttribute("data-app", "mail");
  await page.screenshot({ path: "evidence/action-mail-invite.png" });
  await page.getByTestId("mail-send").click();
  await page.getByTestId("mail-folder-sent").click();
  await expect(page.getByTestId("mail-sent-view")).toContainText("Angebot");
  await page.getByTestId("desktop-quick-question").click();
  await expect(page.getByTestId("desktop-answer")).toContainText("wurde gesendet");
  await page.getByRole("button", { name: "Fenster schließen", exact: true }).click();
  await expect(page.getByTestId("desktop-workspace")).toHaveCount(0);
  await page.getByTestId("dock-crm").click();
  await expect(page.getByTestId("crm-status")).toHaveValue("verhandlung");
  await page.getByTestId("dock-calendar").click();
  await expect(page.getByTestId("app-calendar")).toBeVisible();
  await page.getByRole("button", { name: "Fenster schließen", exact: true }).click();
  await page.evaluate(() => (window as any).__hud.reset());
  await page.getByTestId("dock-mail").click();
  await page.getByTestId("mail-reply-ai").click();
  await expect(page.getByTestId("mail-send")).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId("mail-body")).not.toHaveValue("");
  await page.getByTestId("mail-send").click();
  await expect(page.getByTestId("mail-sent-confirmation")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Briefing, Freigabe und Agenten bleiben sichtbar neben den neuen Apps", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toHaveAttribute("data-tone", "live");
  await page.evaluate(() => (window as any).__hud.play("boot-briefing"));
  await expect(page.getByTestId("stage-view")).toHaveAttribute("data-mode", "desk", { timeout: 15_000 });
  await page.waitForTimeout(5500);
  await expect(page.getByTestId("stage-view")).toHaveAttribute("data-mode", "desk");
  await expect(page.getByTestId("desktop-workspace")).toHaveCount(0);
  await page.screenshot({ path: "evidence/action-briefing.png" });
  await page.evaluate(() => { (window as any).__hud.stop(); (window as any).__hud.reset(); });
  await page.getByTestId("dock-crm").click();
  await page.getByTestId("dock-run").click();
  await expect(page.getByTestId("stage-plan")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("dock-mail")).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("stage-view")).toHaveAttribute("data-mode", "agents", { timeout: 10_000 });
  await expect(page.getByTestId("agent-chip")).toHaveCount(4);
  await expect(page.getByTestId("run-summary")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => { (window as any).__hud.stop(); (window as any).__hud.reset(); });
});

test("Punkt-Mensch spricht ohne Untertitel und überwacht die Systeme", async ({ page }) => {
  await page.goto("/");
  const frame = page.getByTestId("avatar-frame");
  await expect(frame).toHaveAttribute("data-assembled", "true", { timeout: 15_000 });
  await expect(frame).toHaveAttribute("data-mode", "closeup");
  await expect(frame).toHaveAttribute("data-mouth-open", "0.00");
  await expect(page.getByTestId("speaker-greeting")).toHaveCount(0);
  await page.screenshot({ path: "evidence/avatar-closeup.png" });
  const inject = (type: string, payload: unknown) => page.evaluate(({type,payload}) => (window as any).__hud.inject({ id: type+Date.now(), ts: Date.now(), sessionId: "demo", type, payload }), {type,payload});
  await inject("voice.state", { state: "speaking" });
  await inject("transcript.final", { turnId: "mouth-test", role: "assistant", text: "Ich übernehme das." });
  await expect.poll(() => frame.getAttribute("data-mouth-open")).not.toBe("0.00");
  await expect(page.getByTestId("speaker-line")).toHaveCount(0);
  await page.screenshot({ path: "evidence/avatar-speaking.png" });
  await inject("voice.state", { state: "idle" });
  await expect(frame).toHaveAttribute("data-mouth-open", "0.00");
  await inject("tool.started", { callId: "watch-test", tool: "list_emails", args: {} });
  await expect(frame).toHaveAttribute("data-mode", "fullbody");
  await expect(page.getByTestId("system-node-mail")).toHaveAttribute("data-tone", "active");
  await inject("tool.finished", { callId: "watch-test", tool: "list_emails", ok: true, summary: "Mails gelesen", durationMs: 200 });
  await expect(frame).toHaveAttribute("data-mode", "closeup");
  // Successful mail reads now reveal the inbox automatically.
  await expect(page.getByTestId("desktop-workspace")).toHaveAttribute("data-app", "mail");
  await page.getByRole("button", { name: "Fenster schließen", exact: true }).click();
  // control deck: the call shows up in the tool ring and the activity feed
  await expect(page.getByTestId("tool-spot-list_emails")).toHaveAttribute("data-tone", "done");
  await expect(page.getByTestId("deck-feed")).toContainText("Mails gelesen");
  await expect(page.getByTestId("deck-globe")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "evidence/control-deck.png" });
  await page.getByTestId("watch-toggle").click();
  await expect(frame).toHaveAttribute("data-zoom", "1.00", { timeout: 10_000 });
  await page.screenshot({ path: "evidence/avatar-systems.png" });
  const fps = await page.evaluate(() => new Promise<number>((resolve) => {
    let n=0; const start=performance.now();
    const f=()=>{ n++; const dt=performance.now()-start; if(dt<2000) requestAnimationFrame(f); else resolve(Math.round(n*1000/dt)); };
    requestAnimationFrame(f);
  }));
  console.log(`Avatar with six systems at 1920x1080: ${fps} fps`);
  expect(fps).toBeGreaterThanOrEqual(30);
  await page.getByTestId("system-node-crm").click();
  await expect(page.getByTestId("crm-detail")).toContainText("Müller GmbH");
  await page.getByRole("button", {name:"Fenster schließen",exact:true}).click();
  await expect(page.getByTestId("watch-toggle")).toBeVisible();
  await page.evaluate(() => (window as any).__hud.reset());
});

test("Punkt-Mensch bleibt ohne WebGL im Canvas-Fallback sichtbar", async ({ page }) => {
  await page.goto("/?avatar=2d");
  const frame=page.getByTestId("avatar-frame");
  await expect(frame).toHaveAttribute("data-renderer", "canvas2d");
  await expect(frame).toHaveAttribute("data-assembled", "true", {timeout:15_000});
  await page.screenshot({path:"evidence/avatar-fallback.png"});
  await page.getByTestId("watch-toggle").click();
  await expect(frame).toHaveAttribute("data-mode","fullbody");
});

test("Ein WebGL-Shaderfehler wechselt auf einen separaten Canvas", async ({ page }) => {
  await page.addInitScript(() => {
    const get = WebGLRenderingContext.prototype.getShaderParameter;
    WebGLRenderingContext.prototype.getShaderParameter = function(shader, name) {
      return name === this.COMPILE_STATUS ? false : get.call(this, shader, name);
    };
  });
  await page.goto("/");
  await expect(page.getByTestId("avatar-frame")).toHaveAttribute("data-renderer", "canvas2d");
  await expect(page.getByTestId("avatar-fallback")).toBeVisible();
  await expect(page.getByTestId("avatar-frame")).toHaveAttribute("data-assembled", "true", {timeout:15_000});
  await page.screenshot({path:"evidence/avatar-shader-fallback.png"});
});


test("Gesprochene Fensterbefehle öffnen und schließen die sichtbaren Apps", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toHaveAttribute("data-tone", "live");
  const say = (text: string) => page.evaluate((text) => (window as any).__hud.inject({ id: "spoken-"+Date.now(), ts: Date.now(), sessionId: "demo", type: "transcript.final", payload: { turnId: "spoken-"+Date.now(), role: "user", text } }), text);
  for (const [text, app] of [["Öffne mein CRM", "crm"], ["Zeig mir das Angebot für Müller", "offer"], ["Welche Mails habe ich?", "mail"], ["Öffne meinen Kalender", "calendar"]]) {
    await say(text!);
    await expect(page.getByTestId("desktop-workspace")).toHaveAttribute("data-app", app!);
  }
  await say("Öffne die Mails");
  await page.getByTestId("mail-new").click();
  await page.getByTestId("mail-body").fill("Entwurf behalten");
  await page.evaluate(() => (window as any).__hud.inject({id:"focus-mail-draft",ts:Date.now(),sessionId:"demo",type:"ui.focus",payload:{entity:"mail",entityId:"M-101",label:"Mail"}}));
  await expect(page.getByTestId("mail-body")).toHaveCount(0);
  await page.getByTestId("mail-folder-drafts").click();
  await expect(page.getByTestId("mail-body")).toHaveValue("Entwurf behalten");
  await say("Welche Mails habe ich?");
  await expect(page.getByTestId("mail-body")).toHaveCount(0);
  await page.getByTestId("mail-folder-drafts").click();
  await expect(page.getByTestId("mail-body")).toHaveValue("Entwurf behalten");
  await say("Mach das Fenster zu");
  await expect(page.getByTestId("desktop-workspace")).toHaveCount(0);
  await say("Wie öffne ich mein CRM?");
  await expect(page.getByTestId("desktop-workspace")).toHaveCount(0);
});
