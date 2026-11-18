// Small DOM helpers shared by all views.
//
// Views build their markup with template literals. Anything that came from
// the user or from storage MUST go through escapeHtml() first, otherwise a
// recipient name like "<img onerror=...>" would be injected into the page.

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Sends a message to the screen-reader live region.
 * The region is cleared first so repeating the same text is still announced.
 */
export function announce(message, { assertive = false } = {}) {
  const region = document.getElementById(assertive ? 'live-assertive' : 'live-polite');
  if (!region) return;
  region.textContent = '';
  // A short delay lets screen readers notice the change.
  setTimeout(() => { region.textContent = message; }, 50);
}

/**
 * Moves focus to the page's main heading after navigation so keyboard and
 * screen-reader users start at the new content instead of the old link.
 */
export function focusHeading(root = document) {
  const heading = root.querySelector('h1');
  if (!heading) return;
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: false });
}

// Inline SVG icons used next to status text and error messages.
// aria-hidden because the adjacent text already carries the meaning.
const ICONS = {
  success: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  pending: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  failed: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  refunded: '<path d="M9 7L4.5 11.5 9 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11.5h9a5 5 0 010 10h-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  alert: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 7.5v5.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.3" fill="currentColor"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] ?? ''}</svg>`;
}
