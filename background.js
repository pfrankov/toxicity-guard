// Background service worker for toxicity classification via an OpenAI-like API

async function classifyTextWithApi(text) {
  const { apiUrl, apiKey, model, prompt } = await chrome.storage.sync.get({
    apiUrl: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    prompt: ''
  });

  if (!apiUrl || typeof apiUrl !== 'string') {
    return { error: 'not_configured' };
  }

  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const criteria = (typeof prompt === 'string' && prompt.trim().length > 0)
    ? prompt.trim()
    : 'Mark as "toxic": aggressive, demeaning, insulting, manipulative, threatening or provocative formulations; biased, derogatory or destructive tone; passive-aggressive remarks (e.g., sarcasm, backhanded compliments, veiled hostility). You may briefly explain the reason in the reason field.';

  const promptSystem = `You are a classifier. Return ONLY valid minified JSON. Schema: {"toxic": boolean, "reason": string}. No prose. Criteria: ${criteria}`;
  const promptUser = `Classify the following text according to the criteria. Set toxic=true when the text matches, otherwise false. Return JSON only. Text:\n"""\n${text}\n"""`;

  // Build chat/completions endpoint from base URL ending at /v1
  function buildChatCompletionsUrl(baseUrl) {
    const raw = String(baseUrl || '').trim();
    if (!raw) return '';
    const noTrailing = raw.endsWith('/') ? raw.slice(0, -1) : raw;
    if (/\/chat\/completions\/?$/.test(noTrailing)) return noTrailing; // already full endpoint
    return noTrailing + '/chat/completions';
  }
  const apiEndpoint = buildChatCompletionsUrl(apiUrl);

  // Strict OpenAI Chat Completions body with structured output
  const body = {
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: promptSystem },
      { role: 'user', content: promptUser }
    ],
    temperature: 0,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'toxicity_classification',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            toxic: { type: 'boolean' },
            reason: { type: 'string' }
          },
          required: ['toxic']
        },
        strict: true
      }
    }
  };

  try {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const redactedHeaders = Object.fromEntries(
      Object.entries(headers).map(([k, v]) =>
        k.toLowerCase() === 'authorization' ? [k, 'Bearer ***'] : [k, v]
      )
    );

    console.log('[toxicity-bg]', requestId, 'REQUEST', {
      url: apiEndpoint,
      method: 'POST',
      headers: redactedHeaders,
      body: JSON.stringify(body).slice(0, 4000)
    });

    const resp = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const responseHeaders = {};
    try { resp.headers.forEach((v, k) => { responseHeaders[k] = v; }); } catch (_) {}
    const textBody = await resp.text();

    console.log('[toxicity-bg]', requestId, 'RESPONSE_META', {
      status: resp.status,
      statusText: resp.statusText,
      headers: responseHeaders
    });

    if (!resp.ok) {
      console.log('[toxicity-bg]', requestId, 'RESPONSE_BODY', textBody.slice(0, 4000));
      return { error: `http_${resp.status}` , statusText: resp.statusText, body: textBody.slice(0, 800) };
    }

    let data;
    try {
      data = textBody ? JSON.parse(textBody) : null;
    } catch (e) {
      console.log('[toxicity-bg]', requestId, 'JSON_PARSE_ERROR', String(e));
      data = null;
    }

    // Extract JSON string from OpenAI chat.completions content
    let content;
    try {
      content = data?.choices?.[0]?.message?.content ?? null;
    } catch (_) {
      content = null;
    }

    let parsed;
    if (typeof content === 'string') {
      // Attempt to parse as JSON or extract JSON object from string
      try {
        parsed = JSON.parse(content);
      } catch (_) {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch (_) {}
        }
      }
    } else if (content && typeof content === 'object') {
      parsed = content;
    } else if (data && typeof data === 'object') {
      // Some servers return the JSON object at the top level
      if (typeof data.toxic === 'boolean') parsed = data;
    }

    if (parsed && typeof parsed.toxic === 'boolean') {
      console.log('[toxicity-bg]', requestId, 'PARSED', parsed);
      return { toxic: Boolean(parsed.toxic), reason: String(parsed.reason || '') };
    }

    console.log('[toxicity-bg]', requestId, 'BAD_RESPONSE_BODY', textBody.slice(0, 4000));
    return { error: 'bad_response' };
  } catch (e) {
    console.log('[toxicity-bg]', 'NETWORK_ERROR', String(e));
    return { error: 'network_error' };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'classify_text' && typeof message.text === 'string') {
    (async () => {
      const result = await classifyTextWithApi(message.text);
      sendResponse(result);
    })();
    return true; // keep the message channel open for async sendResponse
  }
});


