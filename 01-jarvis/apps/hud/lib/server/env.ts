import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Server-only env lookup. Secrets live in the root .env of the repository; they are read here on the server and never reach the browser.

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2]!;
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "").trim();
    out[m[1]!] = value;
  }
  return out;
}

function envFiles(): string[] {
  if (process.env.JARVIS_ENV_FILE) return [process.env.JARVIS_ENV_FILE];
  return [path.resolve(process.cwd(), "../../.env")];
}

/** process.env first, then the first root .env file that defines the key. */
export function serverEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  for (const file of envFiles()) {
    if (!existsSync(file)) continue;
    const v = parseEnvFile(readFileSync(file, "utf8"))[name];
    if (v) return v;
  }
  return undefined;
}
