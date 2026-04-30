// Content script for app.crelate.com. Day-1 stub: detects a contact
// detail page and injects a "Push to MatchPoint" button into the page
// header. Day 2 wires it up to the edge function via chrome.runtime.
//
// Crelate's URL pattern for a contact detail is:
//   https://app.crelate.com/main2/contact/<uuid>/...
// Other entities follow a similar pattern. We watch for SPA navigation
// since Crelate is a single-page app — pushState doesn't fire load.

const CRELATE_CONTACT_URL_RE = /\/main2\/contact\/([0-9a-f-]{36})/i;
const BUTTON_ID = 'crelate-bridge-push-btn';

function getCrelateContactIdFromUrl(): string | null {
  const m = location.href.match(CRELATE_CONTACT_URL_RE);
  return m ? m[1] : null;
}

function injectPushButton() {
  if (document.getElementById(BUTTON_ID)) return;
  const id = getCrelateContactIdFromUrl();
  if (!id) return;

  // Crelate's header DOM changes between releases; pick the most stable
  // anchor we can find, fall back to body if needed. The button is
  // floated in the top-right so it doesn't fight with their toolbar.
  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.textContent = '⇄ Pull to MatchPoint';
  btn.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 99999;
    background: #911406;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  `;
  btn.onclick = () => {
    // Day 1: open the popup pointed at this id. Day 2: trigger pull
    // directly via chrome.runtime.sendMessage to background.
    chrome.runtime.sendMessage({ type: 'crelate_pull_request', crelate_id: id });
    btn.textContent = '✓ Use the popup\'s Pull tab';
    btn.style.background = '#166534';
  };
  document.body.appendChild(btn);
}

function removeButton() {
  const el = document.getElementById(BUTTON_ID);
  if (el) el.remove();
}

function update() {
  if (getCrelateContactIdFromUrl()) injectPushButton();
  else removeButton();
}

// Initial + observe SPA route changes.
update();
const observer = new MutationObserver(() => update());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('popstate', update);
