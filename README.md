# Toxicity Guard (Chrome Extension)
<img src="https://github.com/user-attachments/assets/5d4db0d6-fcaa-4774-a45b-4690ce8545d2" width="350" alt=""/>

This extension acts as your real-time conscience, alerting you with a subtle glow if your message could be perceived as toxic. It gives you a crucial moment to pause and rephrase, helping you avoid online arguments and regret.

## Features
- Watches text, search, URL and email inputs and textareas, including dynamically added fields
- Request debouncing (500 ms)
- Settings: API URL, optional API key, model, prompt

## Installation (Developer Mode)
1. Download/clone the repository.
2. Open Chrome → Menu → More Tools → Extensions.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the `toxicity-guard` folder.

## Configuration
1. Open the extension page → "Details" → "Extension options", or go to `chrome://extensions/` and click "Options" for the extension.
2. Fill in the fields:
   - OpenAI-like API Base URL — for example: `https://api.openai.com/v1` (the extension will call `/chat/completions` on this base)
   - API key (optional) — if required by the server
   - Model name — for example: `gpt-4o-mini`
   - Set your prompt to override the default
3. Click "Save".

## Privacy
- Text is only sent to your configured endpoint. You can use local Ollama/LM Studio models.
- The key is stored in `chrome.storage.sync`.
- Controls observed as password inputs, or with `autocomplete="current-password"` / `"new-password"`, are excluded for the rest of that page's lifetime, even if a site reveals or reuses the same control as text. Disabled, read-only and detached controls are not classified.
- A change of control type or edit invalidates pending results. Already transmitted requests cannot be retracted.
- Input text, prompts and provider responses are not written to the extension console.
- This is not a general secret detector: an unmarked text field or a replacement field that was never observed as a password cannot be recognized reliably. Use the extension only on sites and with endpoints you trust.
- In case of error, the highlight doesn't change to avoid false toggles.

## Compatibility
- The endpoint must support Chat Completions with strict `json_schema` structured output. The request requires both a boolean `toxic` and a string `reason`.
- `contenteditable` editors are not supported. Existing and nested inputs should declare their supported `type` explicitly; discovery of inputs without an explicit type is not consistent.
- The content script runs in the top-level page, not every embedded frame.

## Development checks
No dependency installation is required. With Node.js 22 or 24:

```sh
npm run check
npm test
```

Tests use synthetic text and mocked Chrome APIs/fetch; they never call a provider. CI also runs `test/browser.html` in Chrome to verify real DOM mutation, password-reveal and disabled-fieldset behavior. `test/browser-integration.html` runs the actual content and background scripts together with mocked Chrome transport/storage and a synthetic provider response. A separate hosted smoke test loads the packaged MV3 extension in a fresh, sandboxed Chromium profile and checks the real options/storage, messaging and service-worker path against a synthetic localhost provider. CI installs Playwright 1.63.0 in a temporary tooling directory for that check; the extension has no runtime dependencies. These checks do not measure model classification quality. The CI package contains the files needed to load the extension unpacked.

## License
MIT
