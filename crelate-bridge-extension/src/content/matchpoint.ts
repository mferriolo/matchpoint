// Content script for the MatchPoint /marketing page. Day-1 stub: just
// confirms it loaded. Day 2-3 will inject "Push to Crelate" buttons on
// individual contact rows by querying for the table row React renders
// (we'll use a stable data-attribute we add to the React component).

console.log('[crelate-bridge] matchpoint content script loaded');

// Reserved for inter-tab messaging if the popup needs to know which
// contact id is selected on the MatchPoint side.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'matchpoint_get_selected_contact') {
    // Look for a data-mp-contact-id attribute we'll add to selected rows
    // in a later pass. Returns null if none found.
    const el = document.querySelector('[data-mp-contact-id]');
    sendResponse({ id: el?.getAttribute('data-mp-contact-id') || null });
  }
  return true;
});
