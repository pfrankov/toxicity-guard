// Content script: watches inputs/textarea, debounces text, requests toxicity classification,
// and toggles a red animated box-shadow when text is toxic.

(function () {
  const HIGHLIGHT_CLASS = 'toxicity-highlight';
  const DEBOUNCE_MS = 500;

  /**
   * Keep per-element timers and last requested text to avoid stale updates.
   */
  const elementToTimerId = new WeakMap();
  const elementToLastRequestedText = new WeakMap();

  function isTargetElement(node) {
    if (!(node instanceof HTMLElement)) return false;
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

  function debounceClassify(el) {
    const currentText = getElementText(el);

    // If empty, remove highlight immediately and skip classification
    if (!currentText || currentText.trim().length === 0) {
      clearExistingTimer(el);
      setHighlight(el, false);
      elementToLastRequestedText.delete(el);
      return;
    }

    clearExistingTimer(el);
    const timerId = setTimeout(() => {
      elementToLastRequestedText.set(el, currentText);
      chrome.runtime.sendMessage({ type: 'classify_text', text: currentText }, (response) => {
        if (!response) return;
        const latest = getElementText(el);
        const lastRequested = elementToLastRequestedText.get(el);
        if (latest !== lastRequested) {
          // Stale response; ignore
          return;
        }
        if (response.error) {
          // On error, do not change current highlight state
          return;
        }
        setHighlight(el, Boolean(response.toxic));
      });
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

  function scanExisting() {
    const nodes = document.querySelectorAll('input[type="text"], input[type="search"], input[type="url"], input[type="email"], textarea');
    nodes.forEach((n) => attachToElement(n));
  }

  function observeMutations() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              if (isTargetElement(node)) attachToElement(node);
              // Also scan descendants for performance/resilience
              const descendants = node.querySelectorAll?.('input[type="text"], input[type="search"], input[type="url"], input[type="email"], textarea');
              descendants?.forEach((n) => attachToElement(n));
            }
          });
        } else if (m.type === 'attributes' && m.target instanceof HTMLElement) {
          if (m.attributeName === 'type' && m.target.tagName === 'INPUT') {
            attachToElement(m.target);
          }
        }
      }
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['type']
    });
  }

  // Init
  scanExisting();
  observeMutations();
})();


