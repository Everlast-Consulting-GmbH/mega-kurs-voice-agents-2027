import assert from 'node:assert/strict';
import test from 'node:test';
import { apiRequest, readKey, cliEnv, assertToolReadback } from '../scripts/api.mjs';
import { API_ORIGIN } from '../scripts/project.mjs';
import { createClientTools, createTaskUpdates } from '../examples/hud-bridge.mjs';

test('only the specified .env provides credentials; values are not shell executed', () => {
  assert.equal(readKey(() => 'OTHER=ignored\nexport ELEVENLABS_API_KEY="test-$(not-executed)"'), 'test-$(not-executed)');
  assert.throws(() => readKey(() => 'OTHER=value'), /ELEVENLABS_API_KEY.*fehlt/);
  assert.throws(() => readKey(() => 'ELEVENLABS_API_KEY='), /fehlt/);
  assert.equal(cliEnv('test-key', { ELEVENLABS_BASE_URL: 'https://wrong.invalid' }).ELEVENLABS_BASE_URL, API_ORIGIN);
});

test('API calls go to the configured origin only, reject redirects and never print response bodies', async () => {
  let observed;
  const fetcher = async (url, init) => {
    observed = { url, init };
    return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
  };
  assert.deepEqual(await apiRequest('/v1/convai/llm/list', { key: 'secret', fetcher }), { ok: true });
  assert.equal(observed.url, `${API_ORIGIN}/v1/convai/llm/list`);
  assert.equal(observed.init.redirect, 'error');
  assert.equal(observed.init.headers['xi-api-key'], 'secret');
  for (const path of ['https://elsewhere.test', '//elsewhere.test', '/v1/../private']) {
    await assert.rejects(apiRequest(path, { key: 'secret', fetcher }), /path/);
  }
  await assert.rejects(apiRequest('/v1/voices', {
    key: 'secret', fetcher: async () => new Response('sensitive body', { status: 401 }),
  }), error => error.message.includes('401') && !error.message.includes('sensitive'));
});

test('client tools return the acceptance immediately and surface gateway errors', async () => {
  let request;
  const tools = createClientTools(['start_computer_task'], {
    fetcher: async (url, init) => {
      request = { url, init };
      return Response.json({ ok: true, result: { taskId: 'T-1' } });
    },
  });
  assert.deepEqual(JSON.parse(await tools.start_computer_task({ instruction: 'Termin eintragen' })),
    { ok: true, result: { taskId: 'T-1' } });
  assert.equal(request.url, 'http://localhost:8787/tools/start_computer_task');
  assert.equal(request.init.headers['xi-api-key'], undefined);
  const broken = createClientTools(['list_leads'], { fetcher: async () => new Response('', { status: 500 }) });
  assert.equal(JSON.parse(await broken.list_leads({})).ok, false);
});

test('task updates are session scoped, deduplicated and explicitly trigger speech only when idle', () => {
  const sent = [];
  const bridge = createTaskUpdates({
    sessionId: 'demo', sendContextualUpdate: text => sent.push(['context', text]),
    sendUserMessage: text => sent.push(['message', text]),
  });
  const event = { id: 'e1', sessionId: 'demo', type: 'task.done', payload: { taskId: 'T-1', summary: 'Erledigt' } };
  bridge.accept({ ...event, sessionId: 'other' });
  assert.equal(sent.length, 0);
  bridge.accept(event); bridge.accept(event);
  assert.equal(sent.length, 1);
  bridge.flush({ agentBusy: true, userSpeaking: false });
  assert.equal(sent.length, 1);
  bridge.flush({ agentBusy: false, userSpeaking: true });
  assert.equal(sent.length, 1);
  bridge.flush({ agentBusy: false, userSpeaking: false });
  assert.equal(sent.length, 2);
  assert.equal(sent[1][0], 'message');
  bridge.flush({ agentBusy: false, userSpeaking: false });
  assert.equal(sent.length, 2);
});

test('read-back permits only omitted vendor-unsupported bounds, never type/enum/name drift', () => {
  const expected = { name: 'list_leads', parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } } } };
  const remote = { name: 'list_leads', parameters: { type: 'object', properties: { limit: { type: 'integer' } } } };
  assert.doesNotThrow(() => assertToolReadback(expected, remote));
  remote.parameters.properties.limit.type = 'string';
  assert.throws(() => assertToolReadback(expected, remote), /Read-back mismatch/);
});
