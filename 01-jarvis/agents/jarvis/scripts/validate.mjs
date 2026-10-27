import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import Ajv from 'ajv/dist/2020.js';
import { CLI, API_ORIGIN, json, isMain, main } from './project.mjs';
import { readContracts, generateTools } from './gen_tools.mjs';

let vendor;
export function vendorValidator() {
  if (vendor) return vendor;
  const spec = JSON.parse(execFileSync(CLI, ['agents', 'create', '--spec', '--base-url', API_ORIGIN], {
    encoding: 'utf8', maxBuffer: 40 * 1024 * 1024,
  }));
  const ajv = new Ajv({ strict: false, validateFormats: false });
  // CLI 1.4.0's embedded spec has two dangling aliases to this one schema.
  for (const suffix of ['Input', 'Output']) {
    spec.components.schemas[`DynamicVariablesConfig-${suffix}`] ??= spec.components.schemas.DynamicVariablesConfig;
  }
  ajv.addSchema({ components: spec.components }, 'elevenlabs');
  vendor = (name, data) => {
    const check = ajv.compile({ $ref: `elevenlabs#/components/schemas/${name}` });
    assert.ok(check(data), `${name}: ${ajv.errorsText(check.errors)}`);
  };
  return vendor;
}

export function validateProject({ config = json('agent_configs/jarvis.json'), allowUnlinkedTools = false,
  toolRegistry = json('tools.json').tools } = {}) {
  const cc = config.conversation_config;
  assert.equal(cc.agent.language, 'de');
  assert.ok(cc.agent.first_message.length > 0);
  assert.ok(/höchstens (zwei Sätze|dreißig Wörter)/i.test(cc.agent.prompt.prompt), 'Voice response length budget missing');
  assert.equal(cc.tts.model_id, 'eleven_flash_v2_5');
  for (const event of ['audio', 'interruption', 'user_transcript', 'agent_response', 'client_tool_call', 'agent_response_complete']) {
    assert.ok(cc.conversation.client_events.includes(event), `client_events missing ${event}`);
  }
  const { schemas, metadata } = readContracts();
  const expected = generateTools(schemas, metadata);
  const registry = toolRegistry;
  assert.equal(registry.length, expected.length, 'Stale tool registry');
  const check = vendorValidator();
  check('Body_Create_Agent_v1_convai_agents_create_post', config);
  for (const tool of expected) {
    const entry = registry.find(t => t.config === `tool_configs/${tool.name}.json`);
    assert.ok(entry, `Missing tool ${tool.name}`);
    assert.deepEqual(json(entry.config), tool, `Stale tool ${tool.name}; npm run gen`);
    check('ClientToolConfig-Input', tool);
  }
  const ids = registry.map(t => t.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate remote tool IDs');
  if (!allowUnlinkedTools) assert.deepEqual([...cc.agent.prompt.tool_ids].sort(), [...ids].sort(), 'Agent tool_ids are out of sync');
  assert.equal(json('agents.json').agents[0].config, 'agent_configs/jarvis.json');
  return true;
}
if (isMain(import.meta.url)) main(() => { validateProject(); console.log('Config, Contracts und ElevenLabs-API-Schema gültig.'); });
