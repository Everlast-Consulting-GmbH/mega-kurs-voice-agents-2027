import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { CLI, ROOT, API_ORIGIN, ENV_FILE, json } from './project.mjs';

export function readKey(reader = () => readFileSync(ENV_FILE, 'utf8')) {
  let contents;
  try { contents = reader(); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    contents = '';
  }
  const key = parseEnv(contents).ELEVENLABS_API_KEY?.trim();
  if (!key) throw Error(`ELEVENLABS_API_KEY fehlt in ${ENV_FILE}. Kein anderer Key wird verwendet.`);
  return key;
}

export function cliEnv(key, environment = process.env) {
  return { ...environment, ELEVENLABS_API_KEY: key, ELEVENLABS_BASE_URL: API_ORIGIN };
}

export function runCli(args, { key, offline = false } = {}) {
  // Dry-run/spec commands do not authenticate. Explicit dummy prevents keyring fallback.
  const env = cliEnv(offline ? 'offline-no-credentials' : key ?? readKey());
  try {
    const output = execFileSync(CLI, [...args, '--base-url', API_ORIGIN], {
      cwd: ROOT, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(output.replaceAll(env.ELEVENLABS_API_KEY, '[redacted]').trim());
  } catch (error) {
    const message = String(error.stderr ?? '').replaceAll(env.ELEVENLABS_API_KEY, '[redacted]');
    throw Error(`ElevenLabs CLI ${args.join(' ')} fehlgeschlagen: ${message || error.status}`);
  }
}

export async function apiRequest(path, { key = readKey(), method = 'GET', body, fetcher = fetch,
  raw = false, timeoutMs = 60_000 } = {}) {
  if (!/^\/v1\/[a-zA-Z0-9_/?=&.%+-]+$/.test(path) || path.includes('..') || path.includes('%2e')) {
    throw Error('Invalid ElevenLabs API path');
  }
  const response = await fetcher(`${API_ORIGIN}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'xi-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    await response.body?.cancel();
    // Do not echo vendor bodies: they may contain credentials or user data.
    throw Error(`ElevenLabs API ${method} ${path.split('?')[0]}: HTTP ${response.status}`);
  }
  return raw ? response : response.json();
}

export function agentId() {
  const id = json('agents.json').agents[0]?.id;
  if (!id || !/^agent_[a-zA-Z0-9]+$/.test(id)) throw Error('Agent-ID fehlt; zuerst npm run push:agent ausführen.');
  return id;
}

export function assertSubset(expected, actual, path = 'response') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw Error(`Read-back mismatch: ${path}`);
    }
  } else if (expected && typeof expected === 'object') {
    for (const [key, value] of Object.entries(expected)) assertSubset(value, actual?.[key], `${path}.${key}`);
  } else if (expected !== actual) throw Error(`Read-back mismatch: ${path}`);
}

export function assertToolReadback(expected, actual) {
  function normalize(value, remote) {
    if (Array.isArray(value)) return value.map((v, i) => normalize(v, remote?.[i]));
    if (!value || typeof value !== 'object') return value;
    // ElevenLabs' literal property model does not declare numeric bounds.
    // They remain in the generated contract schema and are enforced by the gateway.
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !(['minimum', 'maximum'].includes(key) && remote?.[key] === undefined))
      .map(([key, v]) => [key, normalize(v, remote?.[key])]));
  }
  assertSubset(normalize(expected, actual), actual, expected.name);
}
