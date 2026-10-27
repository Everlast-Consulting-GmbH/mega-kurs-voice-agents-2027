import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, json, writeJson, main, isMain, API_ORIGIN } from './project.mjs';
import { apiRequest, readKey } from './api.mjs';

export const SAMPLE_TEXT = 'Systeme online, Leo. Müller GmbH steht mit vierundachtzigtausend Euro in der Pipeline. Ich trage das Erstgespräch für Dr. Anna Weber am Dienstag um zehn Uhr ein. Die Bestätigung wartet auf deine Freigabe. Bürokratie hat offenbar auch heute Dienst.';
const MODELS = ['eleven_flash_v2_5', 'eleven_v3'];

export function selectVoices(workspace, library, count = 8) {
  const seen = new Set();
  return [
    ...(workspace.voices ?? []).map(v => ({ ...v, source: 'workspace' })),
    ...(library.voices ?? []).map(v => ({ ...v, source: 'library' })),
  ].filter(v => {
    const language = String(v.labels?.language ?? v.language ?? '').toLowerCase();
    const gender = String(v.labels?.gender ?? v.gender ?? '').toLowerCase();
    if (!['de', 'german', 'deutsch'].includes(language) || gender !== 'male' || seen.has(v.voice_id)) return false;
    seen.add(v.voice_id);
    return true;
  }).slice(0, count).map(v => ({ voice_id: v.voice_id, name: v.name, source: v.source,
    public_owner_id: v.public_owner_id ?? v.sharing?.public_owner_id,
    description: v.description ?? '', language: 'de', gender: 'male', impression: 'Noch nicht angehört' }));
}

export async function voiceSamples({ render = false, select } = {}) {
  const key = readKey();
  if (select) {
    const voice = await apiRequest(`/v1/voices/${encodeURIComponent(select)}`, { key });
    const config = json('agent_configs/jarvis.json');
    config.conversation_config.tts.voice_id = voice.voice_id;
    writeJson('agent_configs/jarvis.json', config);
    console.log(`Lokal ausgewählt: ${voice.name} (${voice.voice_id}). Noch nicht deployed.`);
    return;
  }
  const workspace = await apiRequest('/v1/voices', { key });
  let library = { voices: [] };
  if (selectVoices(workspace, library).length < 8) {
    library = await apiRequest('/v1/shared-voices?language=de&gender=male&page_size=100', { key });
  }
  const candidates = selectVoices(workspace, library);
  writeJson('voice-samples/candidates.json', { checkedAt: new Date().toISOString(), apiOrigin: API_ORIGIN, candidates });
  console.table(candidates.map(({ voice_id, name, source, impression }) => ({ voice_id, name, source, impression })));
  if (candidates.length < 5) throw Error(`Nur ${candidates.length} deutsche Männerstimmen im Katalog gefunden. Kandidaten gespeichert; mindestens fünf erforderlich.`);
  if (!render) return;
  const rows = [];
  for (const candidate of candidates) {
    let voiceId = candidate.voice_id;
    if (candidate.source === 'library') {
      if (!candidate.public_owner_id) throw Error(`Library-Stimme ohne public_owner_id: ${voiceId}`);
      const added = await apiRequest(`/v1/voices/add/${candidate.public_owner_id}/${voiceId}`, {
        key, method: 'POST', body: { new_name: candidate.name },
      });
      voiceId = added.voice_id;
    }
    for (const model of MODELS) {
      const start = performance.now();
      const row = { voiceId, name: candidate.name, model, impression: 'Noch nicht angehört', firstByteMs: null, totalMs: null };
      try {
        const response = await apiRequest(`/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`, {
          key, method: 'POST', raw: true,
          body: { text: SAMPLE_TEXT, model_id: model, language_code: 'de',
            voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.05 } },
        });
        const chunks = [];
        for await (const bytes of response.body) {
          if (bytes.length && row.firstByteMs === null) row.firstByteMs = Math.round(performance.now() - start);
          chunks.push(Buffer.from(bytes));
        }
        if (row.firstByteMs === null) throw Error('Keine Audiodaten empfangen');
        row.totalMs = Math.round(performance.now() - start);
        row.file = `voice-samples/${voiceId}-${model}.mp3`;
        mkdirSync(resolve(ROOT, 'voice-samples'), { recursive: true });
        writeFileSync(resolve(ROOT, row.file), Buffer.concat(chunks));
        row.status = 'rendered';
      } catch (error) { row.status = 'failed'; row.error = error.message; }
      rows.push(row);
      writeJson('voice-samples/results.json', { text: SAMPLE_TEXT, rows });
      const csv = ['Voice-ID,Name,Modell,TTFB_ms,Gesamt_ms,Eindruck,Status', ...rows.map(r =>
        [r.voiceId, r.name, r.model, r.firstByteMs, r.totalMs, r.impression, r.status]
          .map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','))].join('\n');
      writeFileSync(resolve(ROOT, 'voice-samples/comparison.csv'), `${csv}\n`);
    }
  }
  console.table(rows);
  if (rows.some(r => r.status !== 'rendered')) throw Error('Einige Stimmproben fehlgeschlagen; Details in voice-samples/results.json. Kein Wechsel aus EU.');
}
if (isMain(import.meta.url)) main(() => {
  const at = process.argv.indexOf('--select');
  if (at >= 0 && !process.argv[at + 1]) throw Error('--select braucht eine Voice-ID');
  return voiceSamples({ render: process.argv.includes('--render'), select: at >= 0 ? process.argv[at + 1] : undefined });
});
