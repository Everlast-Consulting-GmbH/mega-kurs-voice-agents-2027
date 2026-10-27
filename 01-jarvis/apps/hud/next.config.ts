import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // @jarvis/contracts ships TypeScript sources with NodeNext-style ".js" import specifiers.
  // Turbopack cannot map ".js" -> ".ts", so the HUD builds with webpack (see package.json).
  transpilePackages: ["@jarvis/contracts"],
  // Self-contained server bundle for the Docker image, traced from the monorepo root.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ...cfg.resolve.extensionAlias };
    return cfg;
  },
  reactStrictMode: true,
  devIndicators: false,
  agentRules: false,
};

export default config;
