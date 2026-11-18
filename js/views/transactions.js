// Transaction history: search, filter by status, sort, and a results table.
//
// The current search/filter/sort is kept in the URL
// (#/transactions?q=meera&status=failed&sort=amount-desc) so links from the
// overview work, and the back button and bookmarks restore the same view.

import { escapeHtml, announce, qs } from '../lib/dom.js';
import { formatINR, formatDate, methodLabel, statusLabel, plural } from '../lib/format.js';
import { queryTransactions, refundedTotal, SORT_OPTIONS, STATUSES } from '../lib/transactions.js';
import { statusBadge, loadErrorNotice } from './shared.js';

function readFilters(query) {
  const status = query.get('status');
  const sort = query.get('sort');
  return {
    search: query.get('q') ?? '',
    status: STATUSES.includes(status) ? status : 'all',
    sort: SORT_OPTIONS[sort] ? sort : 'date-desc',
  };
}

function hasActiveFilters(filters) {
  return filters.search.trim() !== '' || filters.status !== 'all';
}

/** Writes filters to the URL without triggering the router (replaceState doesn't fire hashchange). */
function writeFiltersToUrl(filters) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('q', filters.search.trim());
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.sort !== 'date-desc') params.set('sort', filters.sort);
  const qsText = params.toString();
  history.replaceState(null, '', `#/transactions${qsText ? `?${qsText}` : ''}`);
}

function describeResults(count, total, filters) {
  if (total === 0) return 'No transactions yet.';
  if (!hasActiveFilters(filters)) return `Showing all ${plural(total, 'transaction')}.`;
  return `Showing ${count} of ${plural(total, 'transaction')}.`;
}

function renderToolbar(filters) {
  return `
    <form class="toolbar" id="filters" role="search" aria-label="Filter transactions">
      <div class="toolbar__search">
        <label for="search">Search by recipient or transaction ID</label>
        <input class="input" type="search" id="search" name="q" value="${escapeHtml(filters.search)}"
          autocomplete="off" spellcheck="false" placeholder="For example, Meera or AP2611">
      </div>
      <div>
        <label for="status-filter">Status</label>
        <select class="select" id="status-filter" name="status">
          <option value="all">All statuses</option>
          ${STATUSES.map((s) => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label for="sort">Sort by</label>
        <select class="select" id="sort" name="sort">
          ${Object.entries(SORT_OPTIONS).map(([value, label]) =>
            `<option value="${value}" ${filters.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
    </form>`;
}

function ariaSort(filters, column) {
  if (!filters.sort.startsWith(column)) return '';
  return `aria-sort="${filters.sort.endsWith('desc') ? 'descending' : 'ascending'}"`;
}

// Explicit role attributes look redundant on a <table>, but on small screens
// the rows are restyled as stacked blocks (display: block), and some browsers
// drop table semantics when display changes. The roles keep screen readers
// announcing it as a table either way.
function renderTable(rows, filters) {
  const body = rows.map((t) => {
    const refunded = refundedTotal(t);
    return `
      <tr role="row">
        <td role="cell" data-label="Date">${formatDate(t.createdAt)}</td>
        <td role="cell" data-label="Recipient" class="cell-recipient">
          <div>
            <a href="#/transactions/${encodeURIComponent(t.id)}">${escapeHtml(t.recipientName)}</a>
            <span class="cell-sub">${escapeHtml(t.payeeId)}</span>
          </div>
        </td>
        <td role="cell" data-label="Transaction ID"><span class="txn-id">${escapeHtml(t.id)}</span></td>
        <td role="cell" data-label="Method">${methodLabel(t.method)}</td>
        <td role="cell" data-label="Status">${statusBadge(t.status)}</td>
        <td role="cell" data-label="Amount" class="cell-amount amount">
          <div>
            ${formatINR(t.amount)}
            ${refunded > 0 && t.status === 'success' ? `<span class="cell-sub">${formatINR(refunded)} refunded</span>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table class="txn-table" role="table" aria-labelledby="results-heading">
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col" ${ariaSort(filters, 'date')}>Date</th>
            <th role="columnheader" scope="col">Recipient</th>
            <th role="columnheader" scope="col">Transaction ID</th>
            <th role="columnheader" scope="col">Method</th>
            <th role="columnheader" scope="col">Status</th>
            <th role="columnheader" scope="col" class="cell-amount" ${ariaSort(filters, 'amount')}>Amount</th>
          </tr>
        </thead>
        <tbody role="rowgroup">${body}</tbody>
      </table>
    </div>`;
}

function renderNoMatches(filters) {
  const parts = [];
  if (filters.search.trim()) parts.push(`matching “${escapeHtml(filters.search.trim())}”`);
  if (filters.status !== 'all') parts.push(`with status ${statusLabel(filters.status).toLowerCase()}`);
  return `
    <div class="empty">
      <h3>No transactions found</h3>
      <p>Nothing ${parts.join(' ')}. Check the spelling, try part of a name or ID, or clear the filters.</p>
      <button type="button" class="btn btn--secondary" data-action="clear-filters">Clear filters</button>
    </div>`;
}

function renderNoTransactions() {
  return `
    <div class="empty">
      <h3>No transactions yet</h3>
      <p>Every payment you make, including failed ones, is listed here so you can track and refund it.</p>
      <a class="btn btn--primary" href="#/pay">Make a payment</a>
    </div>`;
}

function renderResults(all, filters) {
  const rows = queryTransactions(all, filters);
  let content;
  if (all.length === 0) content = renderNoTransactions();
  else if (rows.length === 0) content = renderNoMatches(filters);
  else content = renderTable(rows, filters);

  return {
    count: rows.length,
    html: `
      <div class="results__head">
        <h2 id="results-heading" class="visually-hidden">Results</h2>
        <p class="results__count">${describeResults(rows.length, all.length, filters)}</p>
        ${hasActiveFilters(filters) && rows.length > 0 ? '<button type="button" class="btn btn--link" data-action="clear-filters">Clear filters</button>' : ''}
      </div>
      ${content}`,
  };
}

export const transactionsView = {
  title: 'Transactions',
  render(container, { store, query }) {
    const all = store.getAll();
    const filters = readFilters(query);

    container.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Transactions</h1>
          <p>Search, filter and open any payment to see details or request a refund.</p>
        </div>
        <a class="btn btn--primary" href="#/pay">Make a payment</a>
      </div>
      ${loadErrorNotice(store)}
      <section class="panel results" aria-labelledby="results-heading">
        ${all.length > 0 ? renderToolbar(filters) : ''}
        <div id="results"></div>
      </section>`;

    const resultsEl = qs('#results', container);
    const form = qs('#filters', container);

    function update({ announceCount = false } = {}) {
      const { html, count } = renderResults(all, filters);
      resultsEl.innerHTML = html;
      writeFiltersToUrl(filters);
      if (announceCount) {
        announce(count === 0 ? 'No transactions found.' : describeResults(count, all.length, filters));
      }
    }

    update();
    if (!form) return;

    // Typing in the search box: wait until the user pauses so the screen
    // reader announcement isn't repeated on every keystroke.
    let searchTimer;
    qs('#search', form).addEventListener('input', (event) => {
      filters.search = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => update({ announceCount: true }), 300);
    });

    qs('#status-filter', form).addEventListener('change', (event) => {
      filters.status = event.target.value;
      update({ announceCount: true });
    });

    qs('#sort', form).addEventListener('change', (event) => {
      filters.sort = event.target.value;
      update({ announceCount: false });
      announce(`Sorted by ${SORT_OPTIONS[filters.sort].toLowerCase()}.`);
    });

    // Enter in the search box shouldn't reload the page.
    form.addEventListener('submit', (event) => event.preventDefault());

    container.addEventListener('click', (event) => {
      if (!event.target.closest('[data-action="clear-filters"]')) return;
      filters.search = '';
      filters.status = 'all';
      qs('#search', form).value = '';
      qs('#status-filter', form).value = 'all';
      update({ announceCount: true });
      // The clear button disappears, so put focus somewhere sensible.
      qs('#search', form).focus();
    });
  },
};
