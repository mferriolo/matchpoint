// Content script for app.crelate.com. Detects contact + company detail
// pages and injects a "Pull to MatchPoint" button. The button writes the
// crelate_id + entity type to chrome.storage.local; when the user opens
// the extension popup, the Pull tab consumes that and skips straight to
// the preview.
//
// Crelate URL patterns:
//   /main2/contact/<uuid>
//   /main2/company/<uuid>  (also seen as /account/<uuid> on older builds)
// Crelate is an SPA so we watch the DOM for URL changes — pushState
// doesn't fire load.

const CONTACT_RE = /\/main2\/contact\/([0-9a-f-]{36})/i;
const COMPANY_RE = /\/main2\/(?:company|account)\/([0-9a-f-]{36})/i;
const JOB_RE     = /\/main2\/(?:job|opportunity|jobs)\/([0-9a-f-]{36})/i;
const BUTTON_ID = 'crelate-bridge-push-btn';

type Detected = { entity: 'contact' | 'company' | 'job'; id: string } | null;

function detect(): Detected {
  const c = location.href.match(CONTACT_RE);
  if (c) return { entity: 'contact', id: c[1] };
  const co = location.href.match(COMPANY_RE);
  if (co) return { entity: 'company', id: co[1] };
  const j = location.href.match(JOB_RE);
  if (j) return { entity: 'job', id: j[1] };
  return null;
}

function injectButton(d: NonNullable<Detected>) {
  if (document.getElementById(BUTTON_ID)) return;

  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.textContent = `⇄ Pull ${d.entity} to MatchPoint`;
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
    chrome.storage.local.set({
      pending_pull_id: d.id,
      pending_pull_entity: d.entity,
    }, () => {
      btn.textContent = '✓ Open the extension popup';
      btn.style.background = '#166534';
    });
  };
  document.body.appendChild(btn);
}

function removeButton() {
  document.getElementById(BUTTON_ID)?.remove();
}

function update() {
  const d = detect();
  if (d) injectButton(d);
  else removeButton();
}

update();
const observer = new MutationObserver(() => update());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('popstate', update);
