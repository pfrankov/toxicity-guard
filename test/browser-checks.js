(async () => {
  let assertions = 0;
  const fixture = document.getElementById('fixtures');
  const result = document.getElementById('result');
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    assertions++;
  };
  const edit = (el, value = 'Synthetic text') => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const flush = () => {
    for (const [id, callback] of timers) { timers.delete(id); callback(); }
  };
  const add = async html => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    fixture.append(wrapper);
    await Promise.resolve();
    return wrapper.firstElementChild;
  };
  const isHighlighted = el => el.classList.contains('toxicity-highlight');
  try {
    const el = await add('<input type="text">');
    edit(el, 'Synthetic A'); flush();
    edit(el, 'Synthetic B'); flush();
    const latest = requests.at(-1); const older = requests.at(-2);
    latest.callback({ toxic: false }); older.callback({ toxic: true });
    assert(!isHighlighted(el), 'Old response overwrote newer result');

    for (const type of ['password', 'hidden']) {
      const control = await add('<input type="text">');
      const before = requests.length;
      edit(control); control.type = type; flush();
      edit(control, 'synthetic-placeholder'); flush();
      assert(requests.length === before, `${type} transition sent data`);
    }
    const password = document.getElementById('initial-password');
    const beforePassword = requests.length;
    password.type = 'text'; edit(password, 'synthetic-placeholder'); flush();
    assert(requests.length === beforePassword, 'Password reveal sent data');

    const transient = await add('<input type="text">');
    const beforeTransient = requests.length;
    transient.type = 'password'; transient.type = 'text';
    edit(transient, 'synthetic-placeholder'); flush();
    assert(requests.length === beforeTransient, 'Same-turn password reveal sent data');

    const hinted = await add('<input type="text" autocomplete="section-login current-password">');
    const beforeHint = requests.length;
    hinted.removeAttribute('autocomplete'); edit(hinted, 'synthetic-placeholder'); flush();
    assert(requests.length === beforeHint, 'Removed password hint enabled classification');

    const passwordTextarea = await add('<textarea autocomplete="new-password"></textarea>');
    const beforePasswordTextarea = requests.length;
    passwordTextarea.removeAttribute('autocomplete'); edit(passwordTextarea, 'synthetic-placeholder'); flush();
    assert(requests.length === beforePasswordTextarea, 'Password textarea hint removal sent data');

    const fieldset = await add('<fieldset><legend><input type="text" id="legend-input"></legend><input type="text" id="disabled-input"></fieldset>');
    const legendInput = fieldset.querySelector('#legend-input');
    const disabledInput = fieldset.querySelector('#disabled-input');
    edit(disabledInput); fieldset.disabled = true; flush();
    const beforeDisabled = requests.length;
    edit(disabledInput); flush();
    assert(requests.length === beforeDisabled, 'Disabled fieldset sent data');
    edit(legendInput); flush();
    assert(requests.length === beforeDisabled + 1, 'First legend exception stopped working');
    const readonly = await add('<textarea></textarea>');
    edit(readonly); readonly.readOnly = true; flush();
    const beforeReadonly = requests.length;
    edit(readonly); flush();
    assert(requests.length === beforeReadonly, 'Read-only control sent data');

    const removed = await add('<input type="text">');
    edit(removed); flush(); const removalRequest = requests.at(-1);
    removed.remove(); fixture.append(removed);
    removalRequest.callback({ toxic: true });
    assert(!isHighlighted(removed), 'Removal and reinsertion accepted a stale response');

    const editable = await add('<div contenteditable="true">Synthetic content</div>');
    const missingType = await add('<input>');
    const beforeUnsupported = requests.length;
    editable.dispatchEvent(new Event('input', { bubbles: true })); edit(missingType); flush();
    assert(requests.length === beforeUnsupported, 'Capture scope broadened');

    for (const attribute of ['autocomplete', 'disabled', 'readonly']) {
      missingType.setAttribute(attribute, ''); missingType.removeAttribute(attribute);
      edit(missingType); flush();
      assert(requests.length === beforeUnsupported, `${attribute} broadened missing-type capture`);
    }
    const directMissing = document.createElement('input');
    fieldset.disabled = false; fieldset.append(directMissing);
    await Promise.resolve();
    edit(directMissing); flush(); const missingRequest = requests.at(-1);
    fieldset.disabled = true; fieldset.disabled = false;
    missingRequest.callback({ toxic: true });
    assert(!isHighlighted(directMissing), 'Fieldset toggle accepted an old missing-type request');

    const valid = await add('<textarea></textarea>');
    edit(valid); flush(); requests.at(-1).callback({ toxic: true });
    assert(isHighlighted(valid), 'Valid response did not highlight');
    edit(valid, ''); assert(!isHighlighted(valid), 'Empty input did not clear immediately');
    result.dataset.status = 'passed';
    result.textContent = `${assertions} browser assertions passed`;
  } catch (error) {
    result.dataset.status = 'failed';
    result.textContent = error.stack;
  }
})();
