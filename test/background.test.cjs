const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function setup({ config = {}, result = { choices: [{ message: { content: '{"toxic":true,"reason":"Synthetic reason"}' } }] }, ok = true, status = 200, fail = false } = {}) {
  let handler;
  const requests = [];
  const logs = [];
  const context = {
    chrome: {
      storage: { sync: { get: async defaults => ({ ...defaults, apiUrl: 'https://example.invalid/v1', ...config }) } },
      runtime: { onMessage: { addListener: callback => { handler = callback; } } }
    },
    console: { log: (...args) => logs.push(args) },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (fail) throw new Error('Synthetic fetch error');
      return { ok, status, statusText: 'Synthetic status', headers: { forEach() {} }, text: async () => typeof result === 'string' ? result : JSON.stringify(result) };
    }
  };
  vm.runInNewContext(source, context);
  return {
    requests, logs,
    classify: text => new Promise(resolve => { assert.equal(handler({ type: 'classify_text', text }, {}, resolve), true); })
  };
}

test('sends a valid strict schema and the configured request settings', async () => {
  const h = setup({ config: { model: 'synthetic-model', prompt: 'Synthetic criterion' } });
  const result = await h.classify('Synthetic text');
  assert.equal(result.toxic, true);
  assert.equal(result.reason, 'Synthetic reason');
  assert.equal(h.requests[0].url, 'https://example.invalid/v1/chat/completions');
  const body = JSON.parse(h.requests[0].body);
  assert.equal(body.model, 'synthetic-model');
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.match(body.messages[0].content, /Synthetic criterion/);
  assert.match(body.messages[1].content, /Synthetic text/);
  assert.equal(body.response_format.json_schema.strict, true);
  const schema = body.response_format.json_schema.schema;
  assert.deepEqual(schema.required.slice().sort(), Object.keys(schema.properties).sort());
  assert.equal(schema.additionalProperties, false);
});

test('retains supported provider response formats', async () => {
  for (const result of [
    { choices: [{ message: { content: '{"toxic":false}' } }] },
    { choices: [{ message: { content: '```json\n{"toxic":false}\n```' } }] },
    { choices: [{ message: { content: { toxic: false } } }] },
    { toxic: false }
  ]) {
    const h = setup({ result }); const answer = await h.classify('Synthetic');
    assert.equal(answer.toxic, false); assert.equal(answer.reason, '');
  }
});

test('does not invent success for errors, refusals or invalid classifications', async () => {
  for (const result of ['invalid JSON', {}, { choices: [{ message: { refusal: 'Synthetic refusal', content: null } }] }, { toxic: 'false' }]) {
    const h = setup({ result }); assert.equal((await h.classify('Synthetic')).error, 'bad_response');
  }
  assert.equal((await setup({ fail: true }).classify('Synthetic')).error, 'network_error');
  assert.equal((await setup({ ok: false, status: 429 }).classify('Synthetic')).error, 'http_429');
});

test('does not send when the endpoint is unconfigured', async () => {
  const h = setup({ config: { apiUrl: '' } });
  assert.equal((await h.classify('Synthetic')).error, 'not_configured');
  assert.equal(h.requests.length, 0);
});

test('does not log input, prompt or provider response content', async () => {
  for (const options of [{}, { ok: false, status: 400, result: 'synthetic-sensitive-response' }, { result: 'synthetic-sensitive-response' }]) {
    const h = setup({ ...options, config: { prompt: 'synthetic-private-criterion' } });
    await h.classify('synthetic-private-input');
    const logs = JSON.stringify(h.logs);
    for (const value of ['synthetic-private-input', 'synthetic-private-criterion', 'Synthetic reason', 'synthetic-sensitive-response']) assert.equal(logs.includes(value), false);
  }
});
