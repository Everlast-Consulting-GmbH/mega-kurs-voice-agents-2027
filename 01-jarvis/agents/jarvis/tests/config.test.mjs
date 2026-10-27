import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Ajv from 'ajv/dist/2020.js';
import { generateTools, readContracts, readMetadata, resolveSchema } from '../scripts/gen_tools.mjs';
import { validateProject } from '../scripts/validate.mjs';
import { json } from '../scripts/project.mjs';

test('every contract becomes a response-bearing client tool with the same parameters', () => {
  const { schemas, metadata } = readContracts();
  const tools = generateTools(schemas, metadata);
  assert.deepEqual(tools.map(t => t.name).sort(), Object.keys(schemas).sort());
  for (const tool of tools) {
    assert.equal(tool.type, 'client');
    assert.equal(tool.expects_response, true);
    assert.ok(tool.description.startsWith(metadata[tool.name].description));
    assert.deepEqual(tool.parameters, resolveSchema(schemas[tool.name]));
    assert.deepEqual(tool.parameters.required ?? [], schemas[tool.name].required ?? []);
    assert.ok(!JSON.stringify(tool.parameters).includes('$ref'));
  }
});

test('resolved schemas preserve enums, numeric bounds, case and required arrays', () => {
  const { schemas } = readContracts();
  const ajv = new Ajv();
  const lead = ajv.compile(resolveSchema(schemas.list_leads));
  for (const limit of [0, 51, 1.5]) assert.equal(lead({ limit }), false);
  assert.equal(lead({ limit: 1, status: 'angebot' }), true);
  assert.equal(lead({ status: 'invented' }), false);
  const focus = ajv.compile(resolveSchema(schemas.focus_entity));
  assert.equal(focus({ entity: 'lead', entityId: 'L-007', label: 'Müller GmbH' }), true);
  assert.equal(focus({ entity: 'made_up', entityId: 'L-007', label: 'Müller GmbH' }), false);
  const event = ajv.compile(resolveSchema(schemas.create_event));
  assert.equal(event({ title: 'Demo', start: 'a', end: 'b', attendees: [42] }), false);
  const get = ajv.compile(resolveSchema(schemas.get_lead));
  assert.equal(get({ lead_id: 'L-007' }), false);
});

test('generation fails closed on metadata drift and unresolved refs', () => {
  assert.throws(() => generateTools({ missing: { type: 'object' } }, {}), /metadata/i);
  assert.throws(() => generateTools({}, { extra: {} }), /metadata/i);
  assert.throws(() => resolveSchema({ $ref: '#/$defs/Missing' }), /reference/i);
  assert.throws(() => readMetadata('export const TOOL_META = dangerous();'), /literal/i);
});

test('committed project is valid and generated tools are current', () => {
  assert.equal(validateProject(), true);
});

test('configuration rejects a silent agent, stale tools and missing client events', () => {
  const config = JSON.parse(readFileSync(new URL('../agent_configs/jarvis.json', import.meta.url)));
  config.conversation_config.conversation.client_events = [];
  assert.throws(() => validateProject({ config }), /client_events/);
});

test('partial tool upload can resume, but final validation still requires every ID linked', () => {
  const registry = json('tools.json').tools;
  registry[0].id = 'tool_partial';
  assert.throws(() => validateProject({ toolRegistry: registry }), /out of sync/);
  assert.equal(validateProject({ toolRegistry: registry, allowUnlinkedTools: true }), true);
  const config = json('agent_configs/jarvis.json');
  config.conversation_config.agent.prompt.tool_ids = registry.map(t => t.id).filter(Boolean);
  assert.equal(validateProject({ config, toolRegistry: registry }), true);
});

test('every tool parameter has a description (ElevenLabs rejects parameters without one)', () => {
  const { schemas, metadata } = readContracts();
  const missing = [];
  const walk = (tool, path, schema) => {
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      if (!prop.description?.trim()) missing.push(`${tool}.${path}${key}`);
      if (prop.type === 'object') walk(tool, `${path}${key}.`, prop);
      if (prop.type === 'array' && !prop.items?.description?.trim()) missing.push(`${tool}.${path}${key}[]`);
    }
  };
  for (const tool of generateTools(schemas, metadata)) walk(tool.name, '', tool.parameters);
  assert.deepEqual(missing, []);
});

test('multi-app requests use one approved plan and report measured run results', () => {
  const agent = json('agent_configs/jarvis.json').conversation_config.agent;
  assert.match(agent.first_message, /Leo/);
  assert.match(agent.prompt.prompt, /handle_request/);
  assert.match(agent.prompt.prompt, /run\.planned/);
  assert.match(agent.prompt.prompt, /run\.summary/);
  assert.match(agent.prompt.prompt, /Zeitersparnis/);
  assert.doesNotMatch(agent.prompt.prompt, /Angebot\?/);
});
