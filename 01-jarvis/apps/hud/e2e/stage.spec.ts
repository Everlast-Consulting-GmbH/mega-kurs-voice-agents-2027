import { test, expect, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Evidence for "Sprecher + Bühne": one screenshot per mockup picture
// (evidence/stage-0[1-5]-*.jpg), the approval, notice and explain-bar states, a side-by-side
// comparison with design/stage-layout-mockup.html, fps per moment in stage-metrics.json and
// the full demo as stage-full-demo.mp4.
// Run: pnpm --filter hud exec playwright test   (own ports, see playwright.config.ts)

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const OUT = path.resolve(HERE, "../evidence");
const MOCKUP = path.resolve(HERE, "../design/stage-layout-mockup.html");
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 8797);
mkdirSync(OUT, { recursive: true });

let mock: ChildProcess | null = null;
const fps: Record<string, number> = {};

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect(port, "127.0.0.1");
    sock.once("connect", () => (sock.destroy(), resolve(true)));
    sock.once("error", () => (sock.destroy(), resolve(false)));
  });
}

async function startMock() {
  mock = spawn("pnpm", ["--filter", "@jarvis/mock-events", "start"], { cwd: REPO, detached: true, stdio: "ignore", env: { ...process.env, PORT: String(MOCK_PORT) } });
  await expect.poll(() => portOpen(MOCK_PORT), { timeout: 20_000 }).toBe(true);
}

async function stopMock() {
  if (!mock?.pid) return;
  process.kill(-mock.pid, "SIGTERM");
  mock = null;
  await expect.poll(() => portOpen(MOCK_PORT), { timeout: 10_000 }).toBe(false);
}

test.beforeAll(async () => {
  if (await portOpen(MOCK_PORT)) throw new Error(`port ${MOCK_PORT} is busy; set MOCK_PORT`);
  await startMock();
});
test.afterAll(async () => {
  await stopMock();
  if (Object.keys(fps).length) writeFileSync(path.join(OUT, "stage-metrics.json"), JSON.stringify({ viewport: "1920x1080", fps }, null, 2) + "\n");
});

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `stage-${name}.jpg`), type: "jpeg", quality: 85 });
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
  await page.waitForTimeout(2200); // intro: dots gathered, call bar in
}

test("Bild 1-5 plus Freigabe, Notice, Erklär-Leiste, Werkzeug gelernt und Verbindungsverlust", async ({ page }) => {
  await openStage(page);
  await expect(mode(page)).toHaveAttribute("data-mode", "calm");
  await shot(page, "01-ruhe");
  fps.calm = await measureFps(page);

  // Bild 2 (Bild C of agents-desktop-mockup): the briefing fans out the apps
  await play(page, "boot-briefing");
  await expect(page.getByTestId("briefing-window-crm")).toHaveAttribute("data-on", "true", { timeout: 20_000 });
  await page.waitForTimeout(700);
  await expect(mode(page)).toHaveAttribute("data-mode", "desk");
  await shot(page, "02-briefing");
  fps.briefing = await measureFps(page);
  await page.keyboard.press("d");
  await expect(page.getByTestId("explain-bar")).toBeVisible();
  await expect(page.getByTestId("explain-VERSTANDEN")).toContainText("Frage nach dem Tag");
  await page.waitForTimeout(900);
  await shot(page, "08-erklaer-leiste");
  await page.keyboard.press("d");
  await expect(page.getByTestId("explain-bar")).toBeHidden();

  // Bild 3: the statement is the headline, the chart the evidence; explain bar below
  await reset(page);
  await play(page, "leads-widget");
  await expect(page.getByTestId("stage-chart")).toHaveAttribute("data-kind", "bar_chart", { timeout: 20_000 });
  await expect(page.getByTestId("stage-headline")).toContainText("plus 12 % zum Vormonat");
  await page.keyboard.press("d");
  await expect(page.getByTestId("explain-ERGEBNIS")).toContainText("Diagramm + Antwort", { timeout: 5000 });
  await page.waitForTimeout(700);
  await shot(page, "03-daten");
  fps.widget = await measureFps(page, 1000);
  await expect(page.getByTestId("stage-chart")).toHaveAttribute("data-kind", "map", { timeout: 10_000 });
  await page.waitForTimeout(1600);
  await shot(page, "10-karte");
  await page.keyboard.press("d");

  // Bild 4: the agent window is the stage, Jarvis narrates from the left
  await reset(page);
  await play(page, "computer-use");
  await expect(mode(page)).toHaveAttribute("data-mode", "cu", { timeout: 20_000 });
  await expect(page.getByTestId("stage-computer-progress")).toHaveAttribute("data-step", "6", { timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page.getByTestId("speaker-line")).toHaveCount(0);
  await shot(page, "04-computer-use");
  fps.computerUse = await measureFps(page);
  await expect(page.getByTestId("stage-computer")).toHaveAttribute("data-phase", "done", { timeout: 20_000 });
  await page.waitForTimeout(600);
  await shot(page, "04b-erledigt");

  // Notice -> approval -> call (Bild 5)
  await reset(page);
  await play(page, "approval-call");
  await expect(page.getByTestId("notice-toast")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("sky")).toHaveAttribute("data-mood", "warm");
  await page.waitForTimeout(1600);
  await shot(page, "07-notice");
  fps.notice = await measureFps(page, 1000);
  await expect(page.getByTestId("stage-approval")).toHaveAttribute("data-status", "pending", { timeout: 10_000 });
  await page.waitForTimeout(1200);
  await shot(page, "06-freigabe");
  await page.getByTestId("approval-approve").click();
  await expect(page.getByTestId("stage-approval")).toHaveAttribute("data-status", "approved");
  await page.waitForTimeout(600);
  await shot(page, "06b-freigegeben");
  await expect(page.getByTestId("call-moment")).toHaveAttribute("data-status", "ringing", { timeout: 15_000 });
  await page.waitForTimeout(900);
  await shot(page, "05b-klingelt");
  await expect(page.getByTestId("call-moment")).toHaveAttribute("data-status", "connected", { timeout: 15_000 });
  await expect(page.getByTestId("call-line")).toContainText("Postfach", { timeout: 10_000 });
  await expect(page.getByTestId("sky")).toHaveAttribute("data-mood", "call");
  await page.waitForTimeout(300);
  await shot(page, "05-anruf");
  fps.call = await measureFps(page);
  await expect(page.getByTestId("call-moment")).toBeHidden({ timeout: 20_000 });

  await reset(page);
  await play(page, "tool-learned");
  await expect(page.getByTestId("stage-learned")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  await shot(page, "09-werkzeug-gelernt");

  // Connection loss shows up calmly in the status line and heals by itself
  await reset(page);
  await stopMock();
  await expect(page.getByTestId("status-line")).toHaveAttribute("data-tone", "warn", { timeout: 10_000 });
  await page.waitForTimeout(1200);
  await shot(page, "11-verbindung-weg");
  await startMock();
  await expect(page.getByTestId("status-line")).toHaveAttribute("data-tone", "live", { timeout: 20_000 });
});

test("Vergleich: Vorlage und HUD nebeneinander", async ({ browser }) => {
  const pairs = ["01-ruhe", "02-briefing", "03-daten", "04-computer-use", "05-anruf"];
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
  const page = await ctx.newPage();
  await page.goto(`file://${MOCKUP}`);
  const frames = await page.locator(".f").all();
  expect(frames).toHaveLength(5);
  const refs = await Promise.all(frames.map((f) => f.screenshot({ type: "png" })));
  const b64 = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;
  await page.setViewportSize({ width: 1960, height: 640 });
  for (const [i, name] of pairs.entries()) {
    const hud = readFileSync(path.join(OUT, `stage-${name}.jpg`));
    await page.setContent(
      `<body style="margin:0;background:#111;color:#ddd;font:20px -apple-system,sans-serif;padding:16px">
       <div style="display:flex;gap:16px">
         <figure style="margin:0;flex:1"><img src="${b64(refs[i]!, "image/png")}" style="width:100%;display:block"><figcaption style="margin-top:8px">Vorlage · Bild ${i + 1}</figcaption></figure>
         <figure style="margin:0;flex:1"><img src="${b64(hud, "image/jpeg")}" style="width:100%;display:block"><figcaption style="margin-top:8px">HUD · echter Lauf gegen mock-events</figcaption></figure>
       </div></body>`,
    );
    await page.screenshot({ path: path.join(OUT, `stage-${name}-vergleich.jpg`), type: "jpeg", quality: 82, fullPage: true });
  }
  await ctx.close();
});

test("full-demo: der ganze Ablauf als Video", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: path.join(HERE, "../test-results/video"), size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  await openStage(page);
  await play(page, "full-demo");
  await expect(page.getByTestId("briefing-desk")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("d");
  await expect(page.getByTestId("stage-chart")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("d");
  await expect(page.getByTestId("stage-computer")).toHaveAttribute("data-phase", "takeover", { timeout: 40_000 });
  await expect(page.getByTestId("notice-toast")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("stage-approval")).toHaveAttribute("data-status", "pending", { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("call-moment")).toHaveAttribute("data-status", "connected", { timeout: 20_000 });
  await expect(page.getByTestId("call-moment")).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  const video = page.video();
  await ctx.close();
  if (!video) return;
  const webm = path.join(OUT, "stage-full-demo.webm");
  renameSync(await video.path(), webm);
  const mp4 = path.join(OUT, "stage-full-demo.mp4");
  const ff = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-r", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  if (ff.status === 0) rmSync(webm);
});
