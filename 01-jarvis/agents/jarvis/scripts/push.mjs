import { json, writeJson, main, isMain, API_ORIGIN } from './project.mjs';
import { readKey, runCli, apiRequest, agentId, assertSubset, assertToolReadback } from './api.mjs';
import { validateProject } from './validate.mjs';

export async function push({ live = false } = {}) {
  // A previous partial upload/new contract tool may not be linked to the agent yet.
  validateProject({ allowUnlinkedTools: true });
  if (!live) {
    runCli(['tools', 'push', '--dry-run'], { offline: true });
    runCli(['agents', 'push', '--dry-run'], { offline: true });
    console.log('Offline-Plan: live zuerst Tool-IDs erzeugen/verifizieren, dann in Jarvis eintragen und Agent pushen.');
    return;
  }
  const key = readKey();
  const config = json('agent_configs/jarvis.json');
  const catalog = await apiRequest('/v1/convai/llm/list', { key });
  const model = catalog.llms.find(m => m.llm === config.conversation_config.agent.prompt.llm);
  if (!model || model.deprecation_info?.is_deprecated) throw Error('Gewähltes LLM in deinem ElevenLabs-Workspace nicht verfügbar/abgekündigt. npm run compare -- --list');
  await apiRequest(`/v1/voices/${encodeURIComponent(config.conversation_config.tts.voice_id)}`, { key });
  runCli(['tools', 'push', '--dry-run'], { key });
  runCli(['tools', 'push'], { key });
  const registry = json('tools.json').tools;
  for (const entry of registry) {
    if (!entry.id) throw Error(`Tool ohne Remote-ID: ${entry.config}`);
    const remote = await apiRequest(`/v1/convai/tools/${encodeURIComponent(entry.id)}`, { key });
    assertToolReadback(json(entry.config), remote.tool_config);
  }
  config.conversation_config.agent.prompt.tool_ids = registry.map(t => t.id);
  writeJson('agent_configs/jarvis.json', config);
  validateProject();
  runCli(['agents', 'push', '--dry-run'], { key });
  runCli(['agents', 'push'], { key });
  const id = agentId();
  const remote = await apiRequest(`/v1/convai/agents/${id}`, { key });
  for (const field of ['name', 'conversation_config', 'platform_settings']) assertSubset(config[field], remote[field], field);
  writeJson('results/deployment.json', { agentId: id, apiOrigin: API_ORIGIN, verifiedAt: new Date().toISOString() });
  console.log(`Jarvis verifiziert (${API_ORIGIN}): ${id}. Remote-IDs sind in agents.json und tools.json gespeichert.`);
}
if (isMain(import.meta.url)) main(() => {
  if (process.argv.slice(2).some(a => !['--live', '--dry-run'].includes(a))) throw Error('Usage: push.mjs --dry-run | --live');
  return push({ live: process.argv.includes('--live') });
});
