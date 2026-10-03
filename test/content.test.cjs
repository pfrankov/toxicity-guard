const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

function setup(attributes = {}, tagName = 'INPUT') {
  let observer;
  let timerId = 0;
  const timers = new Map();
  const requests = [];
  const mutations = [];
  class HTMLElement {
    constructor(tagName, attrs = {}) {
      this.tagName = tagName;
      this.attrs = { ...attrs };
      this.value = '';
      this.isConnected = true;
      this.listeners = new Map();
      this.classes = new Set();
      this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value) };
      this.children = [];
    }
    get type() { return this.attrs.type || 'text'; }
    get disabled() { return 'disabled' in this.attrs; }
    get readOnly() { return 'readonly' in this.attrs; }
    getAttribute(name) { return this.attrs[name] ?? null; }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    matches(selector) {
      if (selector === ':disabled') return this.disabled;
      return this.tagName === 'TEXTAREA' && selector.includes('textarea') ||
        this.tagName === 'INPUT' && ['text', 'search', 'url', 'email'].some(type => this.attrs.type === type && selector.includes(`input[type="${type}"]`));
    }
    querySelectorAll(selector) {
      const all = this.children.flatMap(child => [child, ...child.querySelectorAll('input, textarea')]);
      return all.filter(el => selector === 'input, textarea' || selector === 'input' && el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' && selector.includes('textarea') ||
        el.tagName === 'INPUT' && ['text', 'search', 'url', 'email'].some(type => el.attrs.type === type && selector.includes(`input[type="${type}"]`)));
    }
  }
  class HTMLInputElement extends HTMLElement { constructor(attrs) { super('INPUT', attrs); } }
  class HTMLTextAreaElement extends HTMLElement { constructor(attrs) { super('TEXTAREA', attrs); } }
  const root = new HTMLElement('HTML');
  const input = tagName === 'TEXTAREA' ? new HTMLTextAreaElement(attributes) : new HTMLInputElement({ type: 'text', ...attributes });
  root.children.push(input);
  const context = {
    HTMLElement, HTMLInputElement, HTMLTextAreaElement,
    document: { documentElement: root, querySelectorAll: selector => root.querySelectorAll(selector) },
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} takeRecords() { return mutations.splice(0); } },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    chrome: { runtime: { sendMessage: (message, callback) => requests.push({ message, callback }) } }
  };
  vm.runInNewContext(source, context);
  return {
    input, requests, root, context,
    edit(value, el = input) { el.value = value; el.listeners.get('input')?.(); },
    flush() { for (const [id, callback] of timers) { timers.delete(id); callback(); } },
    change(name, value, el = input, deliver = true) {
      const oldValue = el.getAttribute(name);
      if (value === null) delete el.attrs[name]; else el.attrs[name] = value;
      mutations.push({ type: 'attributes', target: el, attributeName: name, oldValue });
      if (deliver) observer(mutations.splice(0));
    },
    removeAndReinsert(el = input) {
      observer([{ type: 'childList', addedNodes: [el], removedNodes: [el] }]);
    },
    add(attrs, nested = false) {
      const el = new HTMLInputElement(attrs);
      const node = nested ? new HTMLElement('DIV') : el;
      if (nested) node.children.push(el);
      root.children.push(node);
      observer([{ type: 'childList', addedNodes: [node], removedNodes: [] }]);
      return el;
    }
  };
}

const highlighted = el => el.classes.has('toxicity-highlight');

test('debounces edits and applies the latest valid result', () => {
  const h = setup(); h.edit('Synthetic first'); h.edit('Synthetic second'); h.flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].message.text, 'Synthetic second');
  h.requests[0].callback({ toxic: true }); assert.equal(highlighted(h.input), true);
});

test('ignores out-of-order results, including repeated text', () => {
  for (const values of [['A', 'B'], ['A', 'B', 'A']]) {
    const h = setup();
    for (const value of values) { h.edit(value); h.flush(); }
    h.requests.at(-1).callback({ toxic: false });
    h.requests[0].callback({ toxic: true });
    assert.equal(highlighted(h.input), false);
  }
});

test('new input invalidates results before its debounce expires', () => {
  const h = setup(); h.edit('Synthetic old'); h.flush(); h.edit('Synthetic new');
  h.requests[0].callback({ toxic: true }); assert.equal(highlighted(h.input), false);
});

test('empty input clears a highlight and invalidates pending callbacks', () => {
  const h = setup(); h.edit('Synthetic'); h.flush(); h.edit('   ');
  h.requests[0].callback({ toxic: true }); assert.equal(highlighted(h.input), false);
  h.flush(); assert.equal(h.requests.length, 1);
});

for (const type of ['password', 'hidden', 'number']) {
  test(`changing to ${type} cancels pending sends and rejects subsequent input`, () => {
    const h = setup(); h.edit('Synthetic old'); h.change('type', type); h.flush();
    h.edit('Synthetic new'); h.flush(); assert.equal(h.requests.length, 0);
  });
  test(`changing to ${type} invalidates a response already in flight`, () => {
    const h = setup(); h.edit('Synthetic'); h.flush(); h.change('type', type);
    h.requests[0].callback({ toxic: true }); assert.equal(highlighted(h.input), false);
  });
}

test('checks eligibility even before the mutation callback is delivered', () => {
  const h = setup(); h.edit('Synthetic'); h.change('type', 'password', h.input, false); h.flush();
  assert.equal(h.requests.length, 0);
});

for (const attr of ['disabled', 'readonly']) {
  test(`${attr} fields do not send, including pending transitions`, () => {
    const h = setup(); h.edit('Synthetic'); h.change(attr, ''); h.flush();
    h.edit('Synthetic next'); h.flush(); assert.equal(h.requests.length, 0);
    h.change(attr, null); h.edit('Synthetic enabled'); h.flush(); assert.equal(h.requests.length, 1);
  });
}

test('does not classify passwords revealed as text', () => {
  const h = setup({ type: 'password' }); h.change('type', 'text'); h.edit('synthetic-placeholder'); h.flush();
  assert.equal(h.requests.length, 0);
});

test('remembers a password transition even after it becomes text again', () => {
  const h = setup(); h.change('type', 'password'); h.change('type', 'text');
  h.edit('synthetic-placeholder'); h.flush(); assert.equal(h.requests.length, 0);
});

for (const autocomplete of ['current-password', 'new-password', 'section-login current-password']) {
  test(`excludes autocomplete=${autocomplete}, even after removal`, () => {
    const h = setup({ autocomplete }); h.edit('synthetic-placeholder'); h.flush();
    h.change('autocomplete', null); h.edit('synthetic-placeholder'); h.flush();
    assert.equal(h.requests.length, 0);
  });
}

test('records sensitive inputs added directly or inside a subtree', () => {
  for (const nested of [false, true]) {
    const h = setup(); const el = h.add({ type: 'password' }, nested);
    h.change('type', 'text', el); h.edit('synthetic-placeholder', el); h.flush();
    assert.equal(h.requests.length, 0);
  }
});

test('does not send detached controls or apply results after detachment', () => {
  const h = setup(); h.edit('Synthetic'); h.input.isConnected = false; h.flush();
  assert.equal(h.requests.length, 0);
  h.input.isConnected = true; h.edit('Synthetic'); h.flush(); h.input.isConnected = false;
  h.requests[0].callback({ toxic: true }); assert.equal(highlighted(h.input), false);
});

test('errors and malformed responses preserve the existing highlight', () => {
  const h = setup(); h.edit('Synthetic'); h.flush(); h.requests[0].callback({ toxic: true });
  for (const response of [{ error: 'network_error' }, undefined, { toxic: 'false' }, {}]) {
    h.edit('Synthetic next'); h.flush(); h.requests.at(-1).callback(response);
    assert.equal(highlighted(h.input), true);
  }
});

test('does not expand the existing initial/nested missing-type selector', () => {
  const h = setup({ type: undefined }); h.edit('Synthetic'); h.flush();
  const el = h.add({}, true); h.edit('Synthetic', el); h.flush(); assert.equal(h.requests.length, 0);
});


test('same-turn password transitions are remembered before an input event', () => {
  const h = setup();
  h.change('type', 'password', h.input, false);
  h.change('type', 'text', h.input, false);
  h.edit('synthetic-placeholder'); h.flush();
  assert.equal(h.requests.length, 0);
});

test('removal and reinsertion invalidates an in-flight request', () => {
  const h = setup(); h.edit('Synthetic'); h.flush(); h.removeAndReinsert();
  h.requests[0].callback({ toxic: true }); assert.equal(highlighted(h.input), false);
});

test('runtime messaging errors preserve the highlight', () => {
  const h = setup(); h.edit('Synthetic'); h.flush(); h.requests[0].callback({ toxic: true });
  h.edit('Synthetic next'); h.flush(); h.context.chrome.runtime.lastError = { message: 'Synthetic messaging failure' };
  h.requests.at(-1).callback({ toxic: false }); assert.equal(highlighted(h.input), true);
});


test('newly observed attributes do not broaden missing-type discovery', () => {
  for (const name of ['autocomplete', 'disabled', 'readonly']) {
    const h = setup({ type: undefined });
    h.change(name, ''); h.change(name, null); h.edit('Synthetic'); h.flush();
    assert.equal(h.requests.length, 0);
  }
});

test('synchronous messaging failures do not escape or change the highlight', () => {
  const h = setup(); h.input.classes.add('toxicity-highlight');
  h.context.chrome.runtime.sendMessage = () => { throw new Error('Synthetic extension shutdown'); };
  h.edit('Synthetic'); assert.doesNotThrow(() => h.flush());
  assert.equal(highlighted(h.input), true);
});


test('password autocomplete excludes textareas, including same-turn hint removal', () => {
  for (const autocomplete of ['current-password', 'new-password']) {
    const h = setup({ autocomplete }, 'TEXTAREA');
    h.change('autocomplete', null, h.input, false);
    h.edit('synthetic-placeholder'); h.flush(); assert.equal(h.requests.length, 0);
  }
  const h = setup({}, 'TEXTAREA');
  h.change('autocomplete', 'current-password', h.input, false);
  h.change('autocomplete', null, h.input, false);
  h.edit('synthetic-placeholder'); h.flush(); assert.equal(h.requests.length, 0);
});
