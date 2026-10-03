(async () => {
  const result = document.getElementById('result');
  let assertions = 0;
  const assert = (condition, message) => { if (!condition) throw new Error(message); assertions++; };
  const edit = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const flush = () => { for (const [id, callback] of timers) { timers.delete(id); callback(); } };
  try {
    const input = document.getElementById('message');
    edit(input, 'Synthetic integration sample'); flush();
    await Promise.all(messageCallbacks);
    assert(apiRequests.length === 1, 'Expected one provider request');
    assert(apiRequests[0].url === 'https://example.invalid/v1/chat/completions', 'Wrong endpoint');
    const body = JSON.parse(apiRequests[0].body);
    assert(body.messages[1].content.includes('Synthetic integration sample'), 'Message not forwarded');
    const schema = body.response_format.json_schema;
    assert(schema.strict && Object.keys(schema.schema.properties).every(key => schema.schema.required.includes(key)), 'Invalid strict schema');
    assert(input.classList.contains('toxicity-highlight'), 'Background response was not applied');
    edit(input, '');
    assert(!input.classList.contains('toxicity-highlight'), 'Clear did not remove outline');

    const password = document.getElementById('password');
    password.type = 'text'; edit(password, 'synthetic-placeholder'); flush();
    await Promise.all(messageCallbacks);
    assert(apiRequests.length === 1, 'Revealed password reached background fetch');
    edit(input, 'Synthetic pending text'); input.type = 'hidden'; flush();
    await Promise.all(messageCallbacks);
    assert(apiRequests.length === 1, 'Hidden transition reached background fetch');
    result.dataset.status = 'passed'; result.textContent = `${assertions} content/background integration assertions passed`;
  } catch (error) {
    result.dataset.status = 'failed'; result.textContent = error.stack;
  }
})();
