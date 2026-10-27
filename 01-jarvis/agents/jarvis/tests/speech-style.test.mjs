import assert from 'node:assert/strict';
import test from 'node:test';
import { speechPatch, SPEECH_SPEED, SPEECH_STYLE } from '../scripts/speech_style.mjs';
import { json } from '../scripts/project.mjs';

test('speech tuning preserves every instruction after the style paragraph and leaves tools out of the patch', () => {
  const original = json('agent_configs/jarvis.json');
  const before = structuredClone(original);
  const patch = speechPatch(original);
  assert.deepEqual(original, before);
  const rest = before.conversation_config.agent.prompt.prompt.split('\n\n').slice(1).join('\n\n');
  assert.equal(patch.conversation_config.agent.prompt.prompt, SPEECH_STYLE+'\n\n'+rest);
  assert.deepEqual(Object.keys(patch.conversation_config.agent.prompt), ['prompt']);
  assert.deepEqual(patch.conversation_config.tts, { speed: SPEECH_SPEED });
  assert.match(patch.conversation_config.agent.prompt.prompt, /konkreter Freigabeplan/);
  assert.match(patch.conversation_config.agent.prompt.prompt, /Erfinde niemals/);
});

test('speech tuning rejects an unfamiliar agent rather than discarding its instructions', () => {
  assert.throws(() => speechPatch({conversation_config:{agent:{prompt:{prompt:'Different agent'}}}}), /Unknown/);
});
