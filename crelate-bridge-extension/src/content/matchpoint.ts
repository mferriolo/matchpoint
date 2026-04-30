// Content script for the MatchPoint /marketing page. The popup uses
// chrome.tabs.sendMessage to ask which contact / company ids are
// currently rendered (i.e. survived all the page's filters). The page
// itself adds data-mp-contact-id / data-mp-company-id attrs to each
// table <tr> so we can scrape without re-parsing React state.

console.log('[crelate-bridge] matchpoint content script loaded');

type Kind = 'contact' | 'company';

function readVisibleIds(kind: Kind): string[] {
  const attr = kind === 'contact' ? 'data-mp-contact-id' : 'data-mp-company-id';
  const ids: string[] = [];
  const seen = new Set<string>();
  document.querySelectorAll(`[${attr}]`).forEach(el => {
    const id = el.getAttribute(attr);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  });
  return ids;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'get_visible_ids') {
    const kind = msg.entity as Kind;
    sendResponse({ ok: true, ids: readVisibleIds(kind), kind, url: location.href });
  }
  return true;
});
