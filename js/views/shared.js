// Markup snippets reused by several views.

import { escapeHtml, icon } from '../lib/dom.js';
import { statusLabel } from '../lib/format.js';

export function statusBadge(status) {
  return `<span class="status status--${escapeHtml(status)}">${icon(status)}${escapeHtml(statusLabel(status))}</span>`;
}

/** Notice shown at the top of a page when saved data could not be loaded. */
export function loadErrorNotice(store) {
  if (!store.loadError) return '';
  return `
    <div class="notice notice--error" role="alert">
      <h2>Saved data problem</h2>
      <p>${escapeHtml(store.loadError)}</p>
    </div>`;
}
