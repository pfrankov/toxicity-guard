// No real extension storage, credentials, provider requests or user profile.
window.requests = [];
window.timers = new Map();
let nextTimer = 0;
window.setTimeout = callback => {
  timers.set(++nextTimer, callback);
  return nextTimer;
};
window.clearTimeout = id => timers.delete(id);
window.chrome = {
  runtime: { sendMessage: (message, callback) => requests.push({ message, callback }) }
};
