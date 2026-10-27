import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const REPO = resolve(ROOT, '../..');
export const ENV_FILE = resolve(REPO, '.env');
export const DEFAULT_ORIGIN = 'https://api.elevenlabs.io';
// EU data residency (needs an EU workspace): ELEVENLABS_API_BASE=https://api.eu.residency.elevenlabs.io
export const EU_ORIGIN = 'https://api.eu.residency.elevenlabs.io';

/** ElevenLabs API origin: process env, then the root .env, else the global default. */
export function resolveOrigin(environment = process.env, reader = () => readFileSync(ENV_FILE, 'utf8')) {
  let value = environment.ELEVENLABS_API_BASE?.trim();
  if (!value) {
    try { value = parseEnv(reader()).ELEVENLABS_API_BASE?.trim(); } catch { value = undefined; }
  }
  if (!value) return DEFAULT_ORIGIN;
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/(^|\.)elevenlabs\.io$/.test(url.hostname) || url.pathname !== '/' || url.search) {
    throw Error(`ELEVENLABS_API_BASE muss ein https-Origin unter elevenlabs.io sein, nicht ${value}`);
  }
  return url.origin;
}
export const API_ORIGIN = resolveOrigin();
export const CLI = resolve(ROOT, 'node_modules/.bin/elevenlabs');
export const json = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
export function writeJson(path, data) {
  const target = resolve(ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`);
}
export const isMain = url => process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === url;
export async function main(fn) {
  try { await fn(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
