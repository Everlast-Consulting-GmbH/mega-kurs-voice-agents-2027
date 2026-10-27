import { defineConfig } from "@playwright/test";

// Evidence run: plays every mock scenario against a production build of the HUD and writes
// screenshots, comparisons with the mockup, a video of full-demo and fps to ./evidence.
// tools/mock-events is started and restarted by the spec itself (connection-loss shot).
// Own ports by default, so a running dev stack (orchestrator :8787, HUD :3000) is never reused.
const HUD_PORT = process.env.HUD_PORT ?? "3100";
const MOCK_PORT = process.env.MOCK_PORT ?? "8797";
process.env.MOCK_PORT = MOCK_PORT;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  timeout: 240_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "./test-results",
  use: {
    baseURL: `http://localhost:${HUD_PORT}`,
    viewport: { width: 1920, height: 1080 },
    // Real GPU (Metal) in headless Chromium; SwiftShader renders WebGL at a few fps.
    launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${HUD_PORT}`,
    // Evidence runs against the mock voice layer (no keys needed) and the spec's mock-events.
    env: {
      NEXT_PUBLIC_VOICE_PROVIDER: "mock",
      NEXT_PUBLIC_EVENTS_URL: `ws://localhost:${MOCK_PORT}/events?sessionId=demo`,
      NEXT_PUBLIC_ORCHESTRATOR_URL: `http://localhost:${MOCK_PORT}`,
      // app windows show the HUD's demo data (same ids as the mock scenarios)
      NEXT_PUBLIC_MOCK_WORLD_URL: "off",
    },
    url: `http://localhost:${HUD_PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
