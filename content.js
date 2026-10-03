// Content script: watches inputs/textarea, debounces text, requests toxicity classification,
// and toggles a red outline when text is toxic.

(function () {
  const HIGHLIGHT_CLASS = 'toxicity-highlight';
  const DEBOUNCE_MS = 500;

  const TARGET_SELECTOR = 'input[type="text"], input[type="search"], input[type="url"], input[type="email"], textarea';
  const elementToTimerId = new WeakMap();
  const elementToRequest = new WeakMap();
  const sensitiveElements = new WeakSet();
  let observer;

  function isPasswordHint(value) {
    return String(value || '').toLowerCase().split(/\s+/)
      .some(token => token === 'current-password' || token === 'new-password');
  }

  function rememberSensitiveElement(el) {
    if ((el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'password') ||
        ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && isPasswordHint(el.getAttribute('autocomplete')))) {
      sensitiveElements.add(el);
    }
  }

  function isTargetElement(node) {
    if (!(node instanceof HTMLElement)) return false;
    rememberSensitiveElement(node);
    if (sensitiveElements.has(node) || !node.isConnected || node.matches(':disabled') || node.readOnly) return false;
    if (node.tagName === 'TEXTAREA') return true;
    if (node.tagName === 'INPUT') {
      const type = (node.getAttribute('type') || 'text').toLowerCase();
      return type === 'text' || type === 'search' || type === 'url' || type === 'email';
    }
    return false;
  }

  function getElementText(el) {
    if (el instanceof HTMLTextAreaElement) return el.value;
    if (el instanceof HTMLInputElement) return el.value;
    return '';
  }

  function setHighlight(el, isToxic) {
    if (isToxic) {
      el.classList.add(HIGHLIGHT_CLASS);
    } else {
      el.classList.remove(HIGHLIGHT_CLASS);
    }
  }

  function invalidate(el) {
    clearExistingTimer(el);
    const request = elementToRequest.get(el);
    if (request) request.text = '';
    elementToRequest.delete(el);
  }

  function debounceClassify(el) {
    // Process same-turn type changes before reading a possibly revealed password.
    processMutations(observer.takeRecords());
    invalidate(el);
    if (!isTargetElement(el) || !getElementText(el).trim()) {
      setHighlight(el, false);
      return;
    }

    const timerId = setTimeout(() => {
      processMutations(observer.takeRecords());
      if (elementToTimerId.get(el) !== timerId) return;
      elementToTimerId.delete(el);
      if (!isTargetElement(el)) return;
      const request = { text: getElementText(el) };
      if (!request.text.trim()) {
        setHighlight(el, false);
        return;
      }
      elementToRequest.set(el, request);
      try {
        chrome.runtime.sendMessage({ type: 'classify_text', text: request.text }, (response) => {
          const messagingError = chrome.runtime.lastError;
          processMutations(observer.takeRecords());
          if (elementToRequest.get(el) !== request) return;
          const isCurrent = isTargetElement(el) && getElementText(el) === request.text;
          invalidate(el);
          if (!isCurrent || messagingError || !response || response.error || typeof response.toxic !== 'boolean') return;
          setHighlight(el, response.toxic);
        });
      } catch (_) {
        invalidate(el);
      }
    }, DEBOUNCE_MS);

    elementToTimerId.set(el, timerId);
  }

  function clearExistingTimer(el) {
    const existing = elementToTimerId.get(el);
    if (existing) {
      clearTimeout(existing);
      elementToTimerId.delete(el);
    }
  }

  function attachToElement(el) {
    if (!isTargetElement(el)) return;
    if ((el).__toxicity_listener_attached) return;
    (el).__toxicity_listener_attached = true;

    el.addEventListener('input', () => debounceClassify(el), { passive: true });
  }

  function scanExisting(root = document) {
    // Record sensitive controls without attaching or reading their values.
    root.querySelectorAll('input, textarea').forEach(rememberSensitiveElement);
    root.querySelectorAll(TARGET_SELECTOR).forEach(attachToElement);
  }

  function processMutations(mutations) {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.removedNodes.forEach(node => {
          if (node instanceof HTMLElement) {
            invalidate(node);
            node.querySelectorAll('input, textarea').forEach(invalidate);
          }
        });
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            rememberSensitiveElement(node);
            attachToElement(node);
            scanExisting(node);
          }
        });
      } else if (m.type === 'attributes' && m.target instanceof HTMLElement) {
        const el = m.target;
        if ((el.tagName === 'INPUT' && m.attributeName === 'type' && String(m.oldValue).toLowerCase() === 'password') ||
            ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
             m.attributeName === 'autocomplete' && isPasswordHint(m.oldValue))) {
          sensitiveElements.add(el);
        }
        rememberSensitiveElement(el);
        invalidate(el);
        if (!isTargetElement(el)) setHighlight(el, false);
        if (m.attributeName === 'type' || el.matches(TARGET_SELECTOR)) attachToElement(el);
        // Disabled fieldsets also disable their controls (except the first legend).
        if (el.tagName === 'FIELDSET' && m.attributeName === 'disabled') {
          el.querySelectorAll('input, textarea').forEach(control => {
            invalidate(control);
            if (!isTargetElement(control)) setHighlight(control, false);
            if (control.matches(TARGET_SELECTOR)) attachToElement(control);
          });
        }
      }
    }
  }

  function observeMutations() {
    observer = new MutationObserver(processMutations);
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['type', 'autocomplete', 'disabled', 'readonly']
    });
  }

  // Init
  scanExisting();
  observeMutations();
})();



