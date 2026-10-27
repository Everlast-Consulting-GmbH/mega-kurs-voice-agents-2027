import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { json, writeJson, main, isMain, API_ORIGIN } from './project.mjs';
import { apiRequest, readKey, agentId } from './api.mjs';
import { sessionDate } from '../examples/hud-bridge.mjs';

export const QUESTIONS = [
  { id: 'briefing', text: 'Was ist heute wichtig?' },
  { id: 'lead', text: 'Was weißt du über den Lead L null null sieben?' },
  { id: 'widget', text: 'Zeig mir die Pipeline nach Monat.' },
  { id: 'computer', text: 'Trag Dr. Anna Weber am nächsten Dienstag um zehn Uhr ein Erstgespräch in der Praxis-App ein.' },
  { id: 'unknown', text: 'Wie viel Umsatz hat die Firma Nebelstern gemacht?' },
];

export function summarizeLatency(rows) {
  if (rows.length !== 5) throw Error('Exactly five / fünf Messungen erforderlich.');
  if (new Set(rows.map(r => r.questionId)).size !== 5 || rows.some(r => !QUESTIONS.some(q => q.id === r.questionId))) {
    throw Error('Five unique / eindeutige Testfragen erforderlich.');
  }
  const kinds = new Set(rows.map(r => r.measurement));
  if (kinds.size !== 1) throw Error('Messarten nicht mischen.');
  const measurement = rows[0].measurement;
  if (!['speech_end_to_audio_playback', 'synthetic_speech_end_to_audio_received', 'text_to_first_audio_received'].includes(measurement)) {
    throw Error('Unbekannte Messart');
  }
  const samples = rows.filter(r => r.success);
  for (const r of samples) {
    if (![r.speechEndMs, r.firstAudioMs].every(Number.isFinite) || r.firstAudioMs < r.speechEndMs) throw Error('Invalid measurement timestamp');
  }
  const times = samples.map(r => r.firstAudioMs - r.speechEndMs).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const medianMs = times.length ? Math.round(times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2) : null;
  return { measurement, total: rows.length, successful: samples.length, medianMs,
    targetMet: measurement === 'speech_end_to_audio_playback' ? samples.length === 5 && medianMs <= 1000 : null };
}

// Trim trailing TTS silence; timestamp the last non-silent PCM sample, not STT arrival.
export function trimPcm(buffer) {
  let end = buffer.length - buffer.length % 2;
  while (end >= 2 && Math.abs(buffer.readInt16LE(end - 2)) < 160) end -= 2;
  if (!end) throw Error('Input-Audio ist leer oder still');
  return buffer.subarray(0, end);
}

export async function measureQuestion(question, { key, id, pcm, textMode = false, request = apiRequest, WebSocketClass = WebSocket }) {
  const signed = await request(`/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`, { key });
  const url = new URL(signed.signed_url);
  if (url.protocol !== 'wss:' || url.hostname !== new URL(API_ORIGIN).hostname || url.username || url.password) {
    throw Error('Signed WebSocket URL gehört nicht zum konfigurierten ElevenLabs-Host');
  }
  const measurement = textMode ? 'text_to_first_audio_received' : 'synthetic_speech_end_to_audio_received';
  return new Promise((resolve, reject) => {
    const ws = new WebSocketClass(url);
    let started = false;
    let settled = false;
    let speechEndMs = null;
    let conversationId;
    const timer = setTimeout(() => finish(Error('Timeout nach 45 Sekunden')), 45_000);
    function finish(error, data) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      if (error) reject(error); else resolve(data);
    }
    const send = data => { if (!settled && ws.readyState === WebSocketClass.OPEN) ws.send(JSON.stringify(data)); };
    // Disable greeting only for this measurement session. Generation-complete
    // events do not guarantee that every greeting TTS chunk has arrived.
    ws.addEventListener('open', () => send({ type: 'conversation_initiation_client_data',
      conversation_config_override: { agent: { first_message: '' } } }));
    ws.addEventListener('error', () => finish(Error('WebSocket-Verbindung fehlgeschlagen')));
    ws.addEventListener('close', () => { if (!settled) finish(Error('WebSocket vor erster Antwort geschlossen')); });
    ws.addEventListener('message', async event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') send({ type: 'pong', event_id: data.ping_event.event_id });
        if (data.type === 'conversation_initiation_metadata') conversationId = data.conversation_initiation_metadata_event.conversation_id;
        if (data.type === 'client_tool_call') {
          // Latency harness has no side effects. Real tool behavior belongs to the integration run.
          const call = data.client_tool_call;
          const asyncTool = ['delegate_task', 'start_computer_task', 'send_email', 'place_call', 'handle_request'].includes(call.tool_name);
          const result = asyncTool ? { ok: true, result: { taskId: 'BENCHMARK-TASK' } }
            : { ok: false, error: 'Messlauf mit Tool-Stubs: Keine Fachdaten verfügbar.' };
          send({ type: 'client_tool_result', tool_call_id: call.tool_call_id, result: JSON.stringify(result), is_error: !result.ok });
        }
        if (data.type === 'conversation_initiation_metadata' && !started) {
          started = true;
          send({ type: 'contextual_update', text: sessionDate() });
          if (textMode) {
            speechEndMs = performance.now();
            send({ type: 'user_message', text: question.text });
          } else {
            const chunkBytes = 640; // PCM16, 16 kHz, mono: 20 ms per chunk.
            const start = performance.now();
            for (let offset = 0; offset < pcm.length && !settled; offset += chunkBytes) {
              const chunk = pcm.subarray(offset, offset + chunkBytes);
              send({ user_audio_chunk: chunk.toString('base64') });
              await delay(Math.max(0, start + Math.min(offset + chunkBytes, pcm.length) / 32 - performance.now()));
            }
            speechEndMs = performance.now();
            // Continue silence so server VAD can close the turn.
            for (let i = 0; i < 150 && !settled; i++) {
              send({ user_audio_chunk: Buffer.alloc(chunkBytes).toString('base64') });
              await delay(20);
            }
          }
        }
        if (data.type === 'audio' && started && speechEndMs === null && data.audio_event?.audio_base_64) {
          finish(Error('Agent antwortete vor Eingabeende; unterbrochene Messung verworfen'));
        } else if (data.type === 'audio' && started && speechEndMs !== null && data.audio_event?.audio_base_64) {
          finish(null, { questionId: question.id, question: question.text, measurement, success: true,
            speechEndMs, firstAudioMs: performance.now(), conversationId });
        }
      } catch (error) { finish(error); }
    });
  });
}

export async function latencyTest({ from, live = false, textMode = false } = {}) {
  if (from) {
    const rows = JSON.parse(readFileSync(from, 'utf8'));
    const summary = summarizeLatency(rows);
    writeJson('results/latency-playback.json', { rows, summary });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (!live) {
    console.table(QUESTIONS);
    console.log('Live: npm run latency -- --live [--text]. HUD-Playback: npm run latency -- --from /pfad/messungen.json');
    return;
  }
  const key = readKey();
  const id = agentId();
  const voice = json('agent_configs/jarvis.json').conversation_config.tts.voice_id;
  const rows = [];
  for (const question of QUESTIONS) {
    try {
      let pcm;
      if (!textMode) {
        const response = await apiRequest(`/v1/text-to-speech/${voice}?output_format=pcm_16000`, {
          key, method: 'POST', raw: true,
          body: { text: question.text, model_id: 'eleven_flash_v2_5', language_code: 'de' },
        });
        pcm = trimPcm(Buffer.from(await response.arrayBuffer()));
      }
      rows.push(await measureQuestion(question, { key, id, pcm, textMode }));
    } catch (error) {
      rows.push({ questionId: question.id, measurement: textMode ? 'text_to_first_audio_received' : 'synthetic_speech_end_to_audio_received', success: false, error: error.message });
    }
    writeJson('results/latency.json', { rows });
    console.log(`${question.id}: ${rows.at(-1).success ? 'gemessen' : rows.at(-1).error}`);
  }
  const summary = summarizeLatency(rows);
  writeJson('results/latency.json', { rows, summary,
    limitations: 'Synthetische deutsche Eingabe, Tool-Stubs, erste empfangene Audio-Daten. Kein Lautsprecher-Playback, kein Live-Gateway. Zielnachweis separat im HUD.' });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.successful < 5) throw Error('Latenzlauf unvollständig; Fehler stehen in results/latency.json.');
}
if (isMain(import.meta.url)) main(() => {
  const at = process.argv.indexOf('--from');
  if (at >= 0 && !process.argv[at + 1]) throw Error('--from braucht eine JSON-Datei');
  return latencyTest({ from: at >= 0 ? process.argv[at + 1] : undefined, live: process.argv.includes('--live'), textMode: process.argv.includes('--text') });
});
