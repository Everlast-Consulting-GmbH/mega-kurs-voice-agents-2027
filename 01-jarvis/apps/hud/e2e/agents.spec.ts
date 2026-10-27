import { test, expect, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Evidence for "Jarvis arbeitet sichtbar in echten Programmen": one screenshot per picture
// of design/agents-desktop-mockup.html (evidence/agents-0[1-3]-*.jpg) plus plan, director key and
// computer use, side-by-side comparisons, fps with four typing agents (agents-metrics.json) and
// the whole Drehbuch as agents-full-demo.mp4. Runs against tools/mock-events and the HUD's demo
// data (no mock world), see playwright.config.ts.
// Run: pnpm --filter hud exec playwright test e2e/agents.spec.ts

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const OUT = path.resolve(HERE, "../evidence");
const MOCKUP = path.resolve(HERE, "../design/agents-desktop-mockup.html");
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 8797);
mkdirSync(OUT, { recursive: true });

let mock: ChildProcess | null = null;
const metrics: Record<string, number> = {};

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect(port, "127.0.0.1");
    sock.once("connect", () => (sock.destroy(), resolve(true)));
    sock.once("error", () => (sock.destroy(), resolve(false)));
  });
}

test.beforeAll(async () => {
  if (await portOpen(MOCK_PORT)) throw new Error(`port ${MOCK_PORT} is busy; set MOCK_PORT`);
  mock = spawn("pnpm", ["--filter", "@jarvis/mock-events", "start"], { cwd: REPO, detached: true, stdio: "ignore", env: { ...process.env, PORT: String(MOCK_PORT) } });
  await expect.poll(() => portOpen(MOCK_PORT), { timeout: 20_000 }).toBe(true);
});
test.afterAll(async () => {
  if (mock?.pid) process.kill(-mock.pid, "SIGTERM");
  await expect.poll(() => portOpen(MOCK_PORT), { timeout: 10_000 }).toBe(false);
  if (Object.keys(metrics).length) writeFileSync(path.join(OUT, "agents-metrics.json"), JSON.stringify({ viewport: "1920x1080", fps: metrics }, null, 2) + "\n");
});

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `agents-${name}.jpg`), type: "jpeg", quality: 86 });
const play = (page: Page, scenario: string) => page.evaluate((s) => (window as any).__hud.play(s), scenario);
const reset = (page: Page) => page.evaluate(() => ((window as any).__hud.stop(), (window as any).__hud.reset()));
const mode = (page: Page) => page.getByTestId("stage-view");

/** Average frame rate over `ms`, measured with rAF inside the page. */
function measureFps(page: Page, ms = 2000): Promise<number> {
  return page.evaluate(
    (dur) =>
      new Promise<number>((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 < dur) requestAnimationFrame(f);
          else resolve(Math.round((n * 1000) / (performance.now() - t0)));
        };
        requestAnimationFrame(f);
      }),
    ms,
  );
}

async function openStage(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toHaveAttribute("data-tone", "live", { timeout: 20_000 });
  await expect(page.getByTestId("orb")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2200);
}

test("Bild A, B und C plus Plan, Regie-Taste und Computer Use", async ({ page }) => {
  await openStage(page);

  // the plan: one approval for four agents
  await play(page, "multi-agent");
  await expect(page.getByTestId("stage-plan")).toHaveAttribute("data-status", "pending", { timeout: 15_000 });
  await page.waitForTimeout(1200);
  await shot(page, "00-plan");
  await page.keyboard.press("Enter");

  // Bild A: four windows, four cursors, typing and the deal in the air
  await expect(mode(page)).toHaveAttribute("data-mode", "agents", { timeout: 10_000 });
  await expect(page.getByTestId("agent-chip")).toHaveCount(4);
  await expect(page.getByTestId("crm-flying")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("calendar-quickadd")).toBeVisible();
  await expect(page.getByTestId("mail-draft")).toBeVisible();
  await page.waitForTimeout(250);
  await shot(page, "01-arbeiten");
  metrics.fourAgentsTyping = await measureFps(page, 2000);
  await expect(page.getByTestId("chat-sent")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("crm-moved")).toBeVisible();
  await expect(page.getByTestId("calendar-ghost")).toHaveAttribute("data-state", "created");
  await expect(page.getByTestId("agent-chip").and(page.locator("[data-done]"))).toHaveCount(4, { timeout: 10_000 });
  await shot(page, "01b-fertig");

  // Bild B: the windows fly back into the sphere, the result stays
  await expect(page.getByTestId("run-summary")).toBeVisible({ timeout: 15_000 });
  metrics.summaryTransition = await measureFps(page, 1500);
  await page.waitForTimeout(600);
  await expect(page.getByTestId("run-summary")).toContainText("4 Aufgaben · 11 Sekunden");
  await shot(page, "02-ergebnis");

  // Bild C: the briefing leafs through calendar, mail and CRM; Müller's mail comes in top right
  await reset(page);
  await play(page, "briefing-apps");
  await expect(mode(page)).toHaveAttribute("data-mode", "desk", { timeout: 15_000 });
  await expect(page.getByTestId("notice-toast")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("briefing-window-crm")).toHaveAttribute("data-on", "true", { timeout: 10_000 });
  await page.waitForTimeout(900);
  await shot(page, "03-briefing");
  metrics.briefing = await measureFps(page, 1500);

  // director key M (invisible to the audience, confirmed in the explain bar)
  await reset(page);
  await page.waitForTimeout(800);
  await page.keyboard.press("d");
  await page.keyboard.press("m");
  await expect(page.getByTestId("regie-confirm")).toContainText("Müller-Lauf gestartet");
  await expect(page.getByTestId("stage-plan")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
  await shot(page, "04-regie");
  await page.keyboard.press("Escape");
  await page.keyboard.press("d");

  // computer use stays a window in the same look
  await reset(page);
  await page.keyboard.press("c");
  await expect(mode(page)).toHaveAttribute("data-mode", "cu", { timeout: 20_000 });
  await expect(page.getByTestId("stage-computer-progress")).toHaveAttribute("data-step", "4", { timeout: 30_000 });
  await page.waitForTimeout(400);
  await shot(page, "05-computer-use");
  await reset(page); // the mock server outlives this page: stop its scenario
});

test("Vergleich: Vorlage und HUD nebeneinander", async ({ browser }) => {
  const pairs = ["01-arbeiten", "02-ergebnis", "03-briefing"];
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
  const page = await ctx.newPage();
  await page.goto(`file://${MOCKUP}`);
  const frames = await page.locator(".f").all();
  expect(frames).toHaveLength(3);
  const refs = await Promise.all(frames.map((f) => f.screenshot({ type: "png" })));
  const b64 = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;
  await page.setViewportSize({ width: 1960, height: 640 });
  for (const [i, name] of pairs.entries()) {
    const hud = readFileSync(path.join(OUT, `agents-${name}.jpg`));
    await page.setContent(
      `<body style="margin:0;background:#111;color:#ddd;font:20px -apple-system,sans-serif;padding:16px">
       <div style="display:flex;gap:16px">
         <figure style="margin:0;flex:1"><img src="${b64(refs[i]!, "image/png")}" style="width:100%;display:block"><figcaption style="margin-top:8px">Vorlage · Bild ${"ABC"[i]}</figcaption></figure>
         <figure style="margin:0;flex:1"><img src="${b64(hud, "image/jpeg")}" style="width:100%;display:block"><figcaption style="margin-top:8px">HUD · echter Lauf gegen mock-events</figcaption></figure>
       </div></body>`,
    );
    await page.screenshot({ path: path.join(OUT, `agents-${name}-vergleich.jpg`), type: "jpeg", quality: 84, fullPage: true });
  }
  await ctx.close();
});

test("Drehbuch: der ganze Ablauf als Video", async ({ browser }) => {
  test.skip(!!process.env.SKIP_VIDEO, "SKIP_VIDEO");
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: path.join(HERE, "../test-results/video"), size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  await openStage(page);
  await reset(page);
  await play(page, "drehbuch");
  await expect(page.getByTestId("notice-toast")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("stage-plan")).toHaveAttribute("data-status", "pending", { timeout: 30_000 });
  await page.waitForTimeout(1800);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("run-summary")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("d");
  await expect(page.getByTestId("stage-chart")).toBeVisible({ timeout: 40_000 });
  await page.keyboard.press("d");
  await expect(page.getByTestId("stage-computer")).toHaveAttribute("data-phase", "done", { timeout: 60_000 });
  await page.waitForTimeout(3500);
  const video = page.video();
  await ctx.close();
  if (!video) return;
  const webm = path.join(OUT, "agents-full-demo.webm");
  renameSync(await video.path(), webm);
  const mp4 = path.join(OUT, "agents-full-demo.mp4");
  const ff = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-r", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  if (ff.status === 0) rmSync(webm);
});
