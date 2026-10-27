import assert from 'node:assert/strict';
import { apiRequest, agentId, assertSubset } from './api.mjs';
import { json, writeJson, main, isMain } from './project.mjs';

export const SPEECH_SPEED = 1.18;
export const SPEECH_STYLE = 'Du bist Jarvis, Leos persönlicher KI-Assistent für diese Demo. Sprich ausschließlich natürliches Deutsch und duze Leo. Antworte direkt, meist mit einem kurzen Satz aus fünf bis fünfzehn Wörtern. Höchstens dreißig Wörter, außer Leo fragt ausdrücklich nach Details oder ein konkreter Freigabeplan braucht mehr. Keine Einleitung, keine Wiederholung der Frage, keine ungefragten Zusatzangebote. Ton souverän, zügig und präzise. Keine Markdown-Formatierung, keine gesprochenen Tool-Namen. Sprich Zahlen, Eurobeträge und Uhrzeiten natürlich aus.';

/** Replace only the speaking-style paragraph; all operational instructions remain verbatim. */
export function speechPatch(remote) {
  const prompt = remote.conversation_config.agent.prompt.prompt;
  const boundary = prompt.indexOf('\n\n');
  if (boundary < 0 || !prompt.includes('handle_request') || !prompt.includes('resolve_approval')) throw Error('Unknown Jarvis prompt structure');
  return { conversation_config: { agent: { prompt: { prompt: SPEECH_STYLE + prompt.slice(boundary) } }, tts: { speed: SPEECH_SPEED } } };
}

function withoutSpeech(config) {
  const copy = structuredClone(config);
  delete copy.agent.prompt.prompt;
  delete copy.tts.speed;
  return copy;
}

export async function applySpeechStyle() {
  const id = agentId();
  const before = await apiRequest(`/v1/convai/agents/${id}`);
  const patch = speechPatch(before);
  await apiRequest(`/v1/convai/agents/${id}`, { method: 'PATCH', body: patch });
  const after = await apiRequest(`/v1/convai/agents/${id}`);
  assertSubset(patch.conversation_config, after.conversation_config);
  assert.deepEqual(withoutSpeech(after.conversation_config), withoutSpeech(before.conversation_config));
  const local = json('agent_configs/jarvis.json');
  local.conversation_config.agent.prompt.prompt = after.conversation_config.agent.prompt.prompt;
  local.conversation_config.tts.speed = after.conversation_config.tts.speed;
  writeJson('agent_configs/jarvis.json', local);
  console.log(JSON.stringify({ agentId: id, speedBefore: before.conversation_config.tts.speed, speedAfter: after.conversation_config.tts.speed, toolsPreserved: after.conversation_config.agent.prompt.tool_ids.length, otherConversationSettingsUnchanged: true }));
}

if (isMain(import.meta.url)) await main(applySpeechStyle);
