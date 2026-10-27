import assert from 'node:assert/strict';
import test from 'node:test';
import { apiRequest, readKey } from '../scripts/api.mjs';

let key;
try { key = readKey(); } catch { /* Missing key is expected offline. */ }
test('live: workspace returns model catalog', {
  skip: !key || process.env.RUN_ELEVENLABS_LIVE !== '1' ? 'Key fehlt oder RUN_ELEVENLABS_LIVE ist nicht 1' : false,
}, async () => {
  const catalog = await apiRequest('/v1/convai/llm/list', { key });
  assert.ok(catalog.llms.length > 0);
});
