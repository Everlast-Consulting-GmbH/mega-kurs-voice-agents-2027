import assert from 'node:assert/strict';
import test from 'node:test';
import { selectVoices } from '../scripts/voice_samples.mjs';
import { selectModels, buildToolTest, summarizeRun, lowestEffort, applyModel } from '../scripts/compare_llms.mjs';
import { summarizeLatency, QUESTIONS, measureQuestion, trimPcm } from '../scripts/latency_test.mjs';
import { vendorValidator } from '../scripts/validate.mjs';
import { API_ORIGIN } from '../scripts/project.mjs';

test('voice candidates are native German males, unique and capped at eight', () => {
  const male = i => ({ voice_id: `v${i}`, name: `Stimme ${i}`, labels: { gender: 'male', language: 'de' } });
  const candidates = selectVoices({ voices: [...Array.from({ length: 10 }, (_, i) => male(i)), male(0),
    { voice_id: 'female', labels: { gender: 'female', language: 'de' } },
    { voice_id: 'english', labels: { gender: 'male', language: 'en' } },
  ] }, { voices: [] });
  assert.equal(candidates.length, 8);
  assert.equal(new Set(candidates.map(v => v.voice_id)).size, 8);
  assert.ok(candidates.every(v => !['female', 'english'].includes(v.voice_id)));
});

test('model candidates must actually be in the workspace catalog and not deprecated', () => {
  const catalog = { llms: [
    { llm: 'gemini-3.8-flash', is_checkpoint: false },
    { llm: 'gpt-5.4-mini', is_checkpoint: false, deprecation_info: { is_deprecated: true } },
    { llm: 'qwen36-35b-a3b', is_checkpoint: false },
  ] };
  assert.deepEqual(selectModels(catalog).map(x => x.llm).sort(), ['gemini-3.8-flash', 'qwen36-35b-a3b']);
});

test('voice turns use the lowest reasoning effort a model offers', () => {
  assert.equal(lowestEffort({ available_reasoning_efforts: ['low', 'medium', 'none'] }), 'none');
  assert.equal(lowestEffort({ available_reasoning_efforts: ['minimal', 'low'] }), 'minimal');
  assert.equal(lowestEffort({ available_reasoning_efforts: ['low', 'high'] }), 'low');
  assert.equal(lowestEffort({ available_reasoning_efforts: null }), undefined);
});

test('tool benchmark evaluates exact dataset and tool ID against vendor schema', () => {
  const body = buildToolTest('tool_widget');
  assert.equal(body.tool_call_parameters.referenced_tool.id, 'tool_widget');
  assert.equal(body.tool_call_parameters.parameters[0].eval.expected_value, 'pipeline_by_month');
  vendorValidator()('UnitTestToolCallEvaluationModel-Input', body.tool_call_parameters);
});

test('missing vendor TTFT is unavailable, never replaced with whole test duration', () => {
  const row = summarizeRun({ test_runs: [{ status: 'passed', agent_responses: [] }] }, 5432);
  assert.equal(row.testWallMs, 5432);
  assert.equal(row.ttftMs, null);
  assert.equal(row.passed, true);
  assert.equal(summarizeRun({ test_runs: [] }, 200).passed, false);
});

test('latency report requires all five unique questions and distinguishes received audio from playback', () => {
  const rows = QUESTIONS.map((q, i) => ({ questionId: q.id, speechEndMs: 1000, firstAudioMs: 1600 + i * 100,
    measurement: 'speech_end_to_audio_playback', success: true }));
  assert.equal(summarizeLatency(rows).medianMs, 800);
  assert.equal(summarizeLatency(rows).targetMet, true);
  assert.throws(() => summarizeLatency(rows.slice(1)), /five|fünf/i);
  assert.throws(() => summarizeLatency([...rows.slice(0, 4), rows[0]]), /unique|eindeutig/i);
  assert.throws(() => summarizeLatency(rows.map(r => ({ ...r, firstAudioMs: 900 }))), /timestamp/i);
  const proxy = summarizeLatency(rows.map(r => ({ ...r, measurement: 'text_to_first_audio_received' })));
  assert.equal(proxy.targetMet, null);
  assert.equal(summarizeLatency(rows.map(r => ({ ...r, success: false }))).targetMet, false);
});

test('latency session disables greeting and measures only after sending the test question', async () => {
  const sent = [];
  class FakeSocket extends EventTarget {
    static OPEN = 1;
    readyState = 1;
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    emit(data) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
    send(text) {
      const data = JSON.parse(text); sent.push(data);
      if (data.type === 'conversation_initiation_client_data') queueMicrotask(() => this.emit({
        type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { conversation_id: 'C-1' },
      }));
      if (data.type === 'user_message') queueMicrotask(() => this.emit({ type: 'audio', audio_event: { audio_base_64: 'AAAA' } }));
    }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  const row = await measureQuestion(QUESTIONS[0], { key: 'test', id: 'agent_test', textMode: true,
    request: async () => ({ signed_url: `${API_ORIGIN.replace('https://', 'wss://')}/v1/convai/conversation?signed=test` }), WebSocketClass: FakeSocket });
  assert.equal(sent[0].conversation_config_override.agent.first_message, '');
  assert.equal(sent.filter(m => m.type === 'user_message').length, 1);
  assert.equal(row.success, true);
  assert.ok(row.firstAudioMs >= row.speechEndMs);
});

test('audio trimming removes TTS trailing silence and rejects an empty signal', () => {
  const audio = Buffer.alloc(8);
  audio.writeInt16LE(1000, 2);
  assert.equal(trimPcm(audio).length, 4);
  assert.throws(() => trimPcm(Buffer.alloc(10)), /leer oder still/);
});

test('applying a model always sets reasoning_effort explicitly, null when unsupported', () => {
  // A merge-style push keeps a stale effort otherwise, and ElevenLabs rejects it for models without one.
  const prompt = { llm: 'gpt-5.4-mini', reasoning_effort: 'none', temperature: 0.2 };
  assert.deepEqual(applyModel(prompt, { llm: 'claude-haiku-4-5', available_reasoning_efforts: null }),
    { llm: 'claude-haiku-4-5', reasoning_effort: null, temperature: 0.2 });
  assert.equal(applyModel(prompt, { llm: 'gemini-3.5-flash-lite', available_reasoning_efforts: ['minimal', 'low'] }).reasoning_effort, 'minimal');
  assert.equal(prompt.llm, 'gpt-5.4-mini'); // input untouched
});
