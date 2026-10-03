// Hosted-only MV3 smoke. Uses an unpacked release ZIP and a fresh browser profile.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const extensionPath = path.resolve(process.argv[2]);
const requests = [];
let delayedResponse;
const reply = (res, toxic) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ toxic, reason: 'Synthetic result' }) } }] }));
};
const server = http.createServer(async (req, res) => {
  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ body, headers: req.headers });
    const text = body.messages[1].content;
    if (text.includes('Synthetic delayed')) delayedResponse = res;
    else reply(res, !text.includes('Synthetic neutral'));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>Synthetic fixture</title><h1>Synthetic fixture</h1><input type="text" id="message"><input type="password" id="password">');
  }
});

(async () => {
  let context;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    context = await chromium.launchPersistentContext('', {
      channel: 'chromium', headless: true, chromiumSandbox: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    context.setDefaultTimeout(30000);
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    await options.locator('#apiUrl').fill(`${base}/v1`);
    await options.locator('#apiKey').fill('synthetic-dummy-key');
    await options.locator('#save').click();
    await options.waitForFunction(() => document.getElementById('status').textContent === 'Saved');
    const page = await context.newPage();
    await page.goto(base);
    await page.locator('#message').fill('Synthetic positive sample');
    await page.waitForFunction(() => document.getElementById('message').classList.contains('toxicity-highlight'));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.authorization, 'Bearer synthetic-dummy-key');
    const schema = requests[0].body.response_format.json_schema;
    assert.equal(schema.strict, true);
    assert.deepEqual(schema.schema.required, ['toxic', 'reason']);

    await page.locator('#message').fill('');
    assert.equal(await page.locator('#message').evaluate(el => el.classList.contains('toxicity-highlight')), false);
    await page.locator('#password').evaluate(el => { el.type = 'text'; });
    await page.locator('#password').fill('synthetic-placeholder');
    await page.waitForTimeout(750); // Beyond the documented 500ms debounce.
    assert.equal(requests.length, 1, 'Revealed password reached the provider');
    await page.locator('#message').fill('Synthetic pending sample');
    await page.locator('#message').evaluate(el => { el.type = 'hidden'; });
    await page.waitForTimeout(750);
    assert.equal(requests.length, 1, 'Hidden input reached the provider');
    await page.locator('#message').evaluate(el => { el.type = 'text'; });
    await page.locator('#message').fill('Synthetic delayed sample');
    for (let n = 0; !delayedResponse && n < 100; n++) await page.waitForTimeout(50);
    assert.ok(delayedResponse, 'Delayed request never reached the provider');
    await page.locator('#message').fill('Synthetic latest positive sample');
    for (let n = 0; requests.length < 3 && n < 100; n++) await page.waitForTimeout(50);
    assert.equal(requests.length, 3);
    await page.waitForFunction(() => document.getElementById('message').classList.contains('toxicity-highlight'));
    const delayedResult = context.waitForEvent('response', {
      predicate: response => response.url().endsWith('/v1/chat/completions') &&
        response.request().postData()?.includes('Synthetic delayed')
    });
    reply(delayedResponse, false);
    await (await delayedResult).finished();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#message').evaluate(el => el.classList.contains('toxicity-highlight')), true, 'Old result replaced the current verdict');
    await page.screenshot({ path: 'extension-smoke.png' });
    console.log('Native MV3 smoke passed: packaged extension, options/storage, real messaging/service worker, synthetic provider, password/hidden guards, and stale ordering');
  } finally {
    if (delayedResponse && !delayedResponse.writableEnded) delayedResponse.end();
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
