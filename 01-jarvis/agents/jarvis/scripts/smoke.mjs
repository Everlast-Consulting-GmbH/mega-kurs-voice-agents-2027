import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import Ajv from 'ajv/dist/2020.js';
import { json, main } from './project.mjs';
import { readContracts } from './gen_tools.mjs';
import { validateProject } from './validate.mjs';
import { createClientTools, createTaskUpdates } from '../examples/hud-bridge.mjs';

await main(async () => {
  validateProject();
  const schemas = readContracts().schemas;
  const ajv = new Ajv();
  const validators = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)]));
  const calls = [];
  const server = createServer(async (req, res) => {
    const name = req.url.split('/').at(-1);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks));
    calls.push({ name, input });
    const valid = validators[name]?.(input);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = valid ? 200 : 422;
    res.end(JSON.stringify(valid ? { ok: true, result: name === 'start_computer_task'
      ? { taskId: 'T-SMOKE' } : { id: 'L-007', name: 'Thomas Müller', company: 'Müller GmbH' } }
      : { ok: false, error: 'Contract mismatch' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const tools = createClientTools(json('tools.json').tools.map(t => json(t.config).name), {
      gateway: `http://127.0.0.1:${server.address().port}`,
    });
    const lead = JSON.parse(await tools.get_lead({ leadId: 'L-007' }));
    assert.equal(lead.result.name, 'Thomas Müller');
    assert.equal(JSON.parse(await tools.focus_entity({ entity: 'lead', entityId: 'L-007', label: lead.result.company })).ok, true);
    assert.equal(JSON.parse(await tools.render_widget({ dataset: 'pipeline_by_month', kind: 'bar_chart' })).ok, true);
    const accepted = JSON.parse(await tools.start_computer_task({ instruction: 'P-001: Erstgespräch am nächsten Dienstag um 10 Uhr', mode: 'pixel' }));
    assert.equal(accepted.result.taskId, 'T-SMOKE');
    assert.equal(JSON.parse(await tools.list_leads({ limit: 51 })).ok, false);
    const messages = [];
    const updates = createTaskUpdates({ sessionId: 'demo',
      sendContextualUpdate: text => messages.push(['context', text]),
      sendUserMessage: text => messages.push(['trigger', text]),
    });
    updates.accept({ id: 'smoke', sessionId: 'demo', type: 'task.done', payload: { taskId: 'T-SMOKE', summary: 'Termin angelegt' } });
    updates.flush({ agentBusy: false, userSpeaking: false });
    assert.deepEqual(messages.map(m => m[0]), ['context', 'trigger']);
    assert.equal(calls.length, 5);
    console.log('Smoke grün: HTTP-Client-Tools → Contract-validierendes Test-Gateway → taskId → contextual update + Sprachtrigger. Keine Cloud-Aufrufe.');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
