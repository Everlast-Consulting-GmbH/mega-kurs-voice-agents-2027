import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // unit tests never reach a running mock world (the data layer falls back to demo data)
  test: { include: ["test/**/*.test.ts", "test/**/*.test.tsx"], environment: "node", env: { NEXT_PUBLIC_MOCK_WORLD_URL: "http://127.0.0.1:9" } },
});
