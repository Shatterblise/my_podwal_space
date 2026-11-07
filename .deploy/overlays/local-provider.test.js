import test from 'node:test';
import assert from 'node:assert/strict';
import { callModel } from '../src/worker.js';

test('an OpenAI-compatible local model is used for free dialogue and custom action interpretation', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  let url, requestBody, authorization;
  globalThis.fetch = async (target, options) => {
    url = String(target);
    requestBody = JSON.parse(options.body);
    authorization = options.headers.authorization;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"custom","customAction":{"title":"Проверить гитару","description":"Проверяет струны и аккуратно настраивает инструмент.","category":"creative","location":"home","durationHours":2}}' } }], usage: { prompt_tokens: 100, completion_tokens: 30 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await callModel({ LOCAL_LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LOCAL_LLM_MODEL: 'qwen3:8b', LOCAL_LLM_API_KEY: 'local-test-key' }, [{ role: 'user', content: 'Return a short JSON object.' }]);
  assert.equal(url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(requestBody.model, 'qwen3:8b');
  assert.equal(authorization, 'Bearer local-test-key');
  assert.equal(result.provider, 'Local LLM');
  assert.equal(result.model, 'qwen3:8b');
  assert.equal(result.usage.completion_tokens, 30);
  assert.match(result.content, /Проверить гитару/);
});
