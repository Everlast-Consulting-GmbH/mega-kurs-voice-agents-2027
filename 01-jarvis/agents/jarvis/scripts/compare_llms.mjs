import { setTimeout as delay } from 'node:timers/promises';
import { json, writeJson, main, isMain } from './project.mjs';
import { readKey, apiRequest, agentId } from './api.mjs';

// Fast, tool-capable candidates for a German voice agent (workspace catalog, 2026-10).
const PREFERENCES = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gpt-5.4-mini', 'claude-haiku-4-5', 'qwen36-35b-a3b'];
const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
/** Voice turns need speed, not deliberation: pick the lowest effort the model supports. */
export function lowestEffort(model) {
  const offered = model.available_reasoning_efforts ?? [];
  return EFFORT_ORDER.find(e => offered.includes(e));
}
export const TEST_QUESTION = 'Zeig mir die Pipeline nach Monat als Balkendiagramm.';
/** Returns a copy of the agent prompt config running `model` at its lowest reasoning effort. */
export function applyModel(prompt, model) {
  return { ...prompt, llm: model.llm, reasoning_effort: lowestEffort(model) ?? null };
}
export function selectModels(catalog) {
  return PREFERENCES.map(id => catalog.llms.find(m => m.llm === id))
    .filter(m => m && !m.is_checkpoint && !m.deprecation_info?.is_deprecated).slice(0, 5);
}
export function buildToolTest(toolId) {
  return {
    name: 'Jarvis: Pipeline-Toolvergleich', type: 'tool',
    chat_history: [{ role: 'user', message: TEST_QUESTION, time_in_call_secs: 0 }],
    check_any_tool_matches: true,
    tool_call_parameters: {
      referenced_tool: { id: toolId, type: 'client' },
      parameters: [{ path: 'dataset', eval: { type: 'exact', expected_value: 'pipeline_by_month' } },
        { path: 'kind', eval: { type: 'exact', expected_value: 'bar_chart' } }],
    },
  };
}
export function summarizeRun(result, elapsedMs) {
  const runs = result.test_runs ?? [];
  const metrics = runs.flatMap(r => (r.agent_responses ?? []).map(turn => turn.conversation_turn_metrics?.metrics).filter(Boolean));
  const ttfts = metrics.map(m => m.convai_llm_service_ttfb?.elapsed_time).filter(v => typeof v === 'number' && v >= 0);
  return { passed: runs.length > 0 && runs.every(r => r.status === 'passed'),
    statuses: runs.map(r => r.status), testWallMs: Math.round(elapsedMs),
    ttftMs: ttfts.length ? Math.round(ttfts.reduce((a, b) => a + b, 0) / ttfts.length * 1000) : null,
    serverMetrics: metrics };
}

export async function compareLlms({ run = false, select } = {}) {
  const key = readKey();
  const catalog = await apiRequest('/v1/convai/llm/list', { key });
  writeJson('results/llm-catalog.json', catalog);
  if (select) {
    const selected = catalog.llms.find(m => m.llm === select && !m.deprecation_info?.is_deprecated);
    if (!selected) throw Error('Gewähltes Modell ist in deinem Workspace nicht verfügbar oder abgekündigt.');
    const config = json('agent_configs/jarvis.json');
    config.conversation_config.agent.prompt = applyModel(config.conversation_config.agent.prompt, selected);
    writeJson('agent_configs/jarvis.json', config);
    console.log(`LLM lokal gewählt: ${selected.llm}. Noch nicht deployed.`);
    return;
  }
  console.table(catalog.llms.map(m => ({ model: m.llm, parallelTools: m.supports_parallel_tool_calls,
    deprecated: m.deprecation_info?.is_deprecated ?? false })));
  if (!run) return;
  const id = agentId();
  const models = selectModels(catalog);
  if (models.length < 2) throw Error('Weniger als zwei Vergleichsmodelle verfügbar; results/llm-catalog.json prüfen.');
  const widget = json('tools.json').tools.find(t => t.config === 'tool_configs/render_widget.json');
  if (!widget?.id) throw Error('render_widget hat keine Remote-ID; zuerst Agent pushen.');
  const config = json('agent_configs/jarvis.json');
  // Reuse the test ID; overrides isolate each experiment from the deployed agent.
  let registry;
  try { registry = json('benchmark-tests.json'); } catch (e) { if (e.code !== 'ENOENT') throw e; registry = {}; }
  const body = buildToolTest(widget.id);
  if (registry.pipelineTestId) {
    await apiRequest(`/v1/convai/agent-testing/${registry.pipelineTestId}`, { key, method: 'PUT', body });
  } else {
    const created = await apiRequest('/v1/convai/agent-testing/create', { key, method: 'POST', body });
    registry.pipelineTestId = created.id;
    writeJson('benchmark-tests.json', registry);
  }
  const rows = [];
  for (const model of models) {
    const conversation_config = structuredClone(config.conversation_config);
    conversation_config.agent.prompt = applyModel(conversation_config.agent.prompt, model);
    const start = performance.now();
    let invocation = await apiRequest(`/v1/convai/agents/${id}/run-tests`, {
      key, method: 'POST', body: { tests: [{ test_id: registry.pipelineTestId }], repeat_count: 3,
        agent_config_override: { conversation_config, platform_settings: config.platform_settings } },
    });
    const invocationId = invocation.id;
    // Hard cap: 60 polls / five minutes, no retry of a billable POST.
    for (let attempt = 0; attempt < 60 && invocation.test_runs.some(r => r.status === 'pending'); attempt++) {
      await delay(5_000);
      invocation = await apiRequest(`/v1/convai/test-invocations/${invocationId}`, { key });
    }
    writeJson(`results/llm-${model.llm}.json`, invocation);
    rows.push({ model: model.llm, invocationId, ...summarizeRun(invocation, performance.now() - start) });
    writeJson('results/llm-comparison.json', { question: TEST_QUESTION,
      note: 'testWallMs enthält Queue, Test und Auswertung. ttftMs ist nur vorhanden, wenn der Server convai_llm_service_ttfb liefert. Kein Audio-Benchmark.', rows });
    console.log(`${model.llm}: ${rows.at(-1).passed ? 'bestanden' : 'fehlgeschlagen/offen'}`);
  }
  console.table(rows.map(({ model, passed, testWallMs, ttftMs }) => ({ model, passed, testWallMs, ttftMs })));
  if (rows.some(r => !r.passed)) throw Error('Nicht alle Modelle bestanden den Toolvergleich; Ergebnisse gespeichert.');
}
if (isMain(import.meta.url)) main(() => {
  const at = process.argv.indexOf('--select');
  if (at >= 0 && !process.argv[at + 1]) throw Error('--select braucht eine Modell-ID');
  return compareLlms({ run: process.argv.includes('--run'), select: at >= 0 ? process.argv[at + 1] : undefined });
});
