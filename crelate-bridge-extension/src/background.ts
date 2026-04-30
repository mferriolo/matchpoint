// MV3 service worker. Currently stateless — all sync happens through the
// edge function via fetch. Reserved for future:
//   - keep-alive ping every 4 minutes when a sync is in flight
//   - chrome.alarms-driven scheduled pulls
//   - chrome.notifications when a content-script triggers a push

chrome.runtime.onInstalled.addListener(() => {
  console.log('[crelate-bridge] installed');
});

// Surface a smoke-test on the icon click that doesn't open the popup —
// useful when debugging a broken popup. Not bound to any UI yet.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ping') {
    sendResponse({ ok: true, ts: Date.now() });
  }
  return true;
});
