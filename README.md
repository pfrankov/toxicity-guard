# Toxicity Guard (Chrome Extension)

Chrome extension (Manifest V3) that monitors input in `input[type="text"|"search"|"url"|"email"]` and `textarea`. Input is sent with delay to an OpenAI-like API (structured output). If the text is toxic — the field is highlighted with an animated red glow; if not — the highlight disappears.

## Features
- Search and track dynamically added input fields on all tabs
- Request debouncing (500 ms)
- Settings: API URL, optional API key, model
- Animated red box-shadow for toxic text

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
3. Click "Save".

## How it works
- `content.js` finds input fields and attaches an `input` handler.
- After 500 ms of no input, sends the text to `background.js`.
- `background.js` makes a POST request to the `${BASE_URL}/chat/completions` endpoint with messages (system + user) and structured output.
- Expected JSON: `{ "toxic": boolean, "reason": string }`.
- When `toxic: true`, the `toxicity-highlight` class from `content.css` is added to the field (animated red box-shadow). When `false`, the class is removed.

## Dynamic content
Uses `MutationObserver` to track the appearance of new fields and changes to the `type` attribute of `input`, so the extension works on SPAs and pages with content loading.

## Privacy
- Text is only sent to your configured endpoint. The key is stored in `chrome.storage.sync`.
- In case of error, the highlight doesn't change to avoid false toggles.

## Project structure
- `manifest.json` — extension description (MV3)
- `background.js` — service worker that makes API requests
- `content.js` — field search and debounce/highlight logic
- `content.css` — highlight animation
- `options.html`, `options.js` — settings page

## Example of compatible API (OpenAI-like chat/completions)
Request body:
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "You are a classifier. Return ONLY valid minified JSON. Schema: {\"toxic\": boolean, \"reason\": string}. No prose." },
    { "role": "user", "content": "Classify if the following text is toxic... Text: \"...\"" }
  ],
  "response_format": { "type": "json_object" }
}
```
Response may contain a JSON string in `choices[0].message.content`:
```json
{"toxic": true, "reason": "contains insult"}
```
Or directly an object at the top level with `toxic` and `reason` fields.

## Development
- After changes, click "Reload" on `chrome://extensions/`.
- To update the service worker, you may need to "Reload" the extension.

## License
MIT
