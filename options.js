document.addEventListener('DOMContentLoaded', async () => {
  const apiUrlEl = document.getElementById('apiUrl');
  const apiKeyEl = document.getElementById('apiKey');
  const modelEl = document.getElementById('model');
  const statusEl = document.getElementById('status');
  const saveBtn = document.getElementById('save');
  const promptEl = document.getElementById('prompt');

  const cfg = await chrome.storage.sync.get({
    apiUrl: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    prompt: ''
  });
  apiUrlEl.value = cfg.apiUrl || '';
  apiKeyEl.value = cfg.apiKey || '';
  modelEl.value = cfg.model || 'gpt-4o-mini';
  promptEl.value = cfg.prompt || '';

  saveBtn.addEventListener('click', async () => {
    const apiUrl = apiUrlEl.value.trim();
    const apiKey = apiKeyEl.value.trim();
    const model = modelEl.value.trim() || 'gpt-4o-mini';
    const prompt = promptEl.value.trim();

    await chrome.storage.sync.set({ apiUrl, apiKey, model, prompt });
    statusEl.textContent = 'Saved';
    setTimeout(() => (statusEl.textContent = ''), 1500);
  });
});


