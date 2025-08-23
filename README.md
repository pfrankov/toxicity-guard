# Toxicity Guard (Chrome Extension)
<img src="https://github.com/user-attachments/assets/5d4db0d6-fcaa-4774-a45b-4690ce8545d2" width="350" alt=""/>

This extension acts as your real-time conscience, alerting you with a subtle glow if your message could be perceived as toxic. It gives you a crucial moment to pause and rephrase, helping you avoid online arguments and regret.

## Features
- Search and track dynamically added input fields on all tabs
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
- In case of error, the highlight doesn't change to avoid false toggles.

## License
MIT
