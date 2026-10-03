// Run the actual content and background scripts together, with only the Chrome
// transport/storage and provider replaced. No network or real credentials.
window.apiRequests = [];
window.messageCallbacks = [];
window.timers = new Map();
let nextTimer = 0;
let messageHandler;
window.setTimeout = callback => { timers.set(++nextTimer, callback); return nextTimer; };
window.clearTimeout = id => timers.delete(id);
window.chrome = {
  storage: { sync: { get: async defaults => ({ ...defaults, apiUrl: 'https://example.invalid/v1' }) } },
  runtime: {
    onMessage: { addListener: handler => { messageHandler = handler; } },
    sendMessage: (message, callback) => {
      messageCallbacks.push(new Promise(resolve => {
        messageHandler(message, {}, response => { callback(response); resolve(response); });
      }));
    }
  }
};
window.fetch = async (url, options) => {
  apiRequests.push({ url, ...options });
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: '{"toxic":true,"reason":"Synthetic classification"}' } }] })
  };
};
