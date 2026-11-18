// Overview (dashboard) page.

import { escapeHtml } from '../lib/dom.js';
import { formatINR, formatRelativeDateTime, methodLabel, plural } from '../lib/format.js';
import { computeStats, recentTransactions, periodSummary, refundedTotal } from '../lib/transactions.js';
import { statusBadge, loadErrorNotice } from './shared.js';

function kpiCell({ label, count, amountText, href, linkHint }) {
  return `
    <div class="kpi">
      <dt>${label}</dt>
      <dd>
        <a href="${href}">
          <span class="kpi__count">${count}</span>
          <span class="kpi__sum">${amountText}</span>
          <span class="visually-hidden">, ${linkHint}</span>
        </a>
      </dd>
    </div>`;
}

function renderKpis(stats) {
  return `
    <section aria-labelledby="kpi-heading">
      <h2 id="kpi-heading" class="visually-hidden">Payment counts</h2>
      <dl class="kpis">
        ${kpiCell({
          label: 'All transactions',
          count: stats.total.count,
          amountText: `${formatINR(stats.total.amount)} sent after refunds`,
          href: '#/transactions',
          linkHint: 'view all transactions',
        })}
        ${kpiCell({
          label: 'Successful',
          count: stats.success.count,
          amountText: formatINR(stats.success.amount),
          href: '#/transactions?status=success',
          linkHint: 'view successful payments',
        })}
        ${kpiCell({
          label: 'Pending',
          count: stats.pending.count,
          amountText: formatINR(stats.pending.amount),
          href: '#/transactions?status=pending',
          linkHint: 'view pending payments',
        })}
        ${kpiCell({
          label: 'Failed',
          count: stats.failed.count,
          amountText: `${formatINR(stats.failed.amount)} not debited`,
          href: '#/transactions?status=failed',
          linkHint: 'view failed payments',
        })}
      </dl>
    </section>`;
}

function renderRecent(transactions) {
  const recent = recentTransactions(transactions, 6);

  const items = recent.map((txn) => {
    const refunded = refundedTotal(txn);
    return `
      <li>
        <a class="activity__item" href="#/transactions/${encodeURIComponent(txn.id)}">
          <span class="activity__name">${escapeHtml(txn.recipientName)}</span>
          <span class="activity__amount amount">${formatINR(txn.amount)}</span>
          <span class="activity__meta">${formatRelativeDateTime(txn.createdAt)} via ${methodLabel(txn.method)}${
            refunded > 0 && txn.status === 'success' ? `, ${formatINR(refunded)} refunded` : ''
          }</span>
          <span class="activity__status">${statusBadge(txn.status)}</span>
        </a>
      </li>`;
  }).join('');

  return `
    <section class="panel" aria-labelledby="recent-heading">
      <div class="panel__head">
        <h2 id="recent-heading">Recent activity</h2>
        <a href="#/transactions">View all transactions</a>
      </div>
      <ul class="activity" role="list">${items}</ul>
    </section>`;
}

function renderSummary(transactions) {
  const summary = periodSummary(transactions, { days: 30 });
  const largest = summary.byMethod.reduce((max, m) => Math.max(max, m.amount), 0);

  const rows = summary.byMethod.map((m) => {
    const width = largest === 0 ? 0 : Math.round((m.amount / largest) * 100);
    return `
      <tr>
        <th scope="row">
          ${methodLabel(m.method)}
          <span class="muted">(${plural(m.count, 'payment')})</span>
          <span class="bar" aria-hidden="true"><span style="width:${width}%"></span></span>
        </th>
        <td class="amount">${formatINR(m.amount)}</td>
      </tr>`;
  }).join('');

  return `
    <section class="panel" aria-labelledby="summary-heading">
      <div class="panel__head">
        <h2 id="summary-heading">Last 30 days</h2>
      </div>
      <div class="panel__body stack">
        <dl class="figures">
          <div><dt>Sent</dt><dd class="amount">${formatINR(summary.sent)}</dd></div>
          <div><dt>Refunded to you</dt><dd class="amount">${formatINR(summary.refunds)}</dd></div>
          <div><dt>Success rate</dt><dd>${summary.successRate === null ? 'No data' : `${summary.successRate}%`}</dd></div>
        </dl>
        ${rows ? `
          <table class="breakdown">
            <caption class="visually-hidden">Money sent by payment method, last 30 days</caption>
            <thead class="visually-hidden"><tr><th scope="col">Method</th><th scope="col">Amount</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>` : '<p class="muted">No completed payments in the last 30 days.</p>'}
      </div>
    </section>`;
}

function renderEmpty() {
  return `
    <section class="panel empty" aria-labelledby="empty-heading">
      <h2 id="empty-heading">No payments yet</h2>
      <p>Payments you make will show up here with their status, so you can track what went through and what needs attention.</p>
      <a class="btn btn--primary" href="#/pay">Make your first payment</a>
    </section>`;
}

export const overviewView = {
  title: 'Overview',
  render(container, { store }) {
    const transactions = store.getAll();
    const stats = computeStats(transactions);

    container.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Overview</h1>
          <p>${transactions.length === 0 ? 'Nothing here yet.' : `Your last ${plural(transactions.length, 'transaction')} at a glance.`}</p>
        </div>
        <a class="btn btn--primary" href="#/pay">Make a payment</a>
      </div>
      <div class="stack">
        ${loadErrorNotice(store)}
        ${renderKpis(stats)}
        ${transactions.length === 0 ? renderEmpty() : `
          <div class="split">
            ${renderRecent(transactions)}
            ${renderSummary(transactions)}
          </div>`}
      </div>`;
  },
};
