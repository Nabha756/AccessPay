// Single transaction page: full details, refund form, status check, pay again.

import { escapeHtml, icon, announce, qs } from '../lib/dom.js';
import { formatINR, formatDateTime, methodLabel, statusLabel } from '../lib/format.js';
import { amountToWords } from '../lib/amount-words.js';
import { parseAmountToPaise } from '../lib/validation.js';
import {
  canRefund, applyRefund, refundableAmount, refundedTotal, RefundError, REFUND_REASONS,
} from '../lib/transactions.js';
import { checkPendingStatus } from '../lib/payment.js';
import { statusBadge } from './shared.js';

function renderNotFound(id) {
  return `
    <a class="back-link" href="#/transactions">All transactions</a>
    <h1>Transaction not found</h1>
    <p class="muted">There is no transaction with ID <span class="txn-id">${escapeHtml(id)}</span>. It may have been cleared from this browser.</p>
    <p><a href="#/transactions">Go back to all transactions</a></p>`;
}

function renderRefundHistory(txn) {
  if (!txn.refunds?.length) return '';
  return `
    <section class="panel" aria-labelledby="refunds-heading">
      <div class="panel__head"><h2 id="refunds-heading">Refunds</h2></div>
      <ul class="refund-list" role="list">
        ${txn.refunds.map((r) => `
          <li>
            <span><strong class="amount">${formatINR(r.amount)}</strong> refunded</span>
            <span class="muted">${escapeHtml(r.reason)}, ${formatDateTime(r.createdAt)}</span>
          </li>`).join('')}
      </ul>
    </section>`;
}

function renderRefundForm(txn) {
  const remaining = refundableAmount(txn);
  return `
    <form class="refund-form" id="refund-form" novalidate hidden>
      <h3 id="refund-form-title">Request a refund</h3>
      <p class="muted">Up to ${formatINR(remaining)} can be refunded. In this demo, refunds go through straight away.</p>
      <div class="field">
        <label for="refund-amount">Refund amount in rupees</label>
        <p class="error-msg" id="refund-amount-error"></p>
        <div class="money-input">
          <span class="money-input__symbol" aria-hidden="true">₹</span>
          <input class="input" type="text" inputmode="decimal" id="refund-amount" name="amount"
            value="${(remaining / 100).toFixed(2)}" autocomplete="off" aria-describedby="refund-amount-error">
        </div>
      </div>
      <div class="field">
        <label for="refund-reason">Reason</label>
        <p class="error-msg" id="refund-reason-error"></p>
        <select class="select" id="refund-reason" name="reason" aria-describedby="refund-reason-error">
          <option value="">Choose a reason</option>
          ${REFUND_REASONS.map((r) => `<option>${r}</option>`).join('')}
        </select>
      </div>
      <div class="btn-row form-actions">
        <button type="submit" class="btn btn--primary">Confirm refund</button>
        <button type="button" class="btn btn--secondary" data-action="cancel-refund">Cancel</button>
      </div>
    </form>`;
}

function renderActions(txn) {
  const refund = canRefund(txn);
  const parts = [];

  if (txn.status === 'pending') {
    parts.push('<button type="button" class="btn btn--primary" data-action="check-status">Check payment status</button>');
  }
  if (refund.allowed) {
    parts.push('<button type="button" class="btn btn--secondary" data-action="open-refund" aria-expanded="false" aria-controls="refund-form">Refund payment</button>');
  }
  // Pay again only for UPI: the full bank account number isn't stored.
  if (txn.payeeType === 'upi' && txn.status !== 'pending') {
    const label = txn.status === 'failed' ? 'Try this payment again' : 'Pay again';
    parts.push(`<a class="btn btn--secondary" href="#/pay?repeat=${encodeURIComponent(txn.id)}">${label}</a>`);
  }

  // Explain why refund isn't offered, unless it's obvious from the status.
  const note = !refund.allowed && txn.status === 'success'
    ? `<p class="muted actions-note">${escapeHtml(refund.reason)}</p>`
    : '';

  return `
    <div class="btn-row">${parts.join('')}</div>
    ${note}
    ${refund.allowed ? renderRefundForm(txn) : ''}`;
}

function renderDetails(txn, flash) {
  const refunded = refundedTotal(txn);
  return `
    <a class="back-link" href="#/transactions">All transactions</a>
    <div class="page-head">
      <div>
        <h1>Payment to ${escapeHtml(txn.recipientName)}</h1>
        <p>${formatDateTime(txn.createdAt)}</p>
      </div>
    </div>

    <div id="flash" tabindex="-1">${flash ?? ''}</div>

    <div class="stack details">
      <section class="panel" aria-labelledby="summary-heading">
        <h2 id="summary-heading" class="visually-hidden">Payment summary</h2>
        <div class="review__amount details__amount">
          <div>
            <p class="review__figure amount">${formatINR(txn.amount)}</p>
            <p class="review__words">${escapeHtml(amountToWords(txn.amount))}</p>
          </div>
          ${statusBadge(txn.status)}
        </div>
        <dl class="details-list">
          <div><dt>Status</dt><dd>${statusLabel(txn.status)}${
            refunded > 0 && txn.status === 'success' ? `, ${formatINR(refunded)} refunded` : ''}</dd></div>
          ${txn.failureReason ? `<div><dt>Reason</dt><dd>${escapeHtml(txn.failureReason)}</dd></div>` : ''}
          <div><dt>Transaction ID</dt><dd><span class="txn-id">${escapeHtml(txn.id)}</span></dd></div>
          <div><dt>To</dt><dd>${escapeHtml(txn.recipientName)}</dd></div>
          <div><dt>${txn.payeeType === 'bank' ? 'Bank account' : 'UPI ID'}</dt><dd>${escapeHtml(txn.payeeId)}</dd></div>
          <div><dt>Paid with</dt><dd>${methodLabel(txn.method)}</dd></div>
          <div><dt>Note</dt><dd>${txn.note ? escapeHtml(txn.note) : '<span class="muted">None</span>'}</dd></div>
        </dl>
      </section>

      ${renderRefundHistory(txn)}

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" class="visually-hidden">Actions</h2>
        ${renderActions(txn)}
      </section>
    </div>`;
}

/** Message shown at the top of the page after an action. */
function flashMessage(message, tone = 'success') {
  const iconName = tone === 'success' ? 'success' : 'alert';
  return `<div class="notice notice--${tone} flash" role="status">${icon(iconName)}<p>${escapeHtml(message)}</p></div>`;
}

function setError(form, field, message) {
  const el = qs(`#refund-${field}-error`, form);
  const input = qs(`#refund-${field}`, form);
  el.innerHTML = message
    ? `${icon('alert')}<span><span class="visually-hidden">Error: </span>${escapeHtml(message)}</span>`
    : '';
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

export const detailsView = {
  title: 'Transaction details',
  render(container, { store, match }) {
    const id = decodeURIComponent(match[1]);

    // Re-renders the page after a change, optionally with a message that
    // receives focus so screen reader users hear what happened.
    function draw(flash = null) {
      const txn = store.getById(id);
      if (!txn) {
        container.innerHTML = renderNotFound(id);
        return;
      }
      container.innerHTML = renderDetails(txn, flash);
      if (flash) qs('#flash', container).focus();
    }

    draw();

    // One delegated listener handles every button on the page, which also
    // means it keeps working after draw() replaces the markup.
    container.onclick = async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      const form = qs('#refund-form', container);

      if (action === 'open-refund') {
        const opening = form.hidden;
        form.hidden = !opening;
        button.setAttribute('aria-expanded', String(opening));
        if (opening) qs('#refund-amount', form).focus();
      }

      if (action === 'cancel-refund') {
        form.hidden = true;
        const toggle = qs('[data-action="open-refund"]', container);
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }

      if (action === 'check-status') {
        if (button.getAttribute('aria-disabled') === 'true') return;
        button.setAttribute('aria-disabled', 'true');
        button.textContent = 'Checking with your bank…';
        announce('Checking payment status.');

        const before = store.getById(id);
        const after = await checkPendingStatus(before);
        if (after.status !== before.status) store.update(after);

        const messages = {
          success: ['Your bank confirmed the payment. It is now successful.', 'success'],
          failed: ['The payment did not go through. No money was debited.', 'error'],
          pending: ['Still waiting for your bank to confirm. Try again in a little while.', 'info'],
        };
        draw(flashMessage(...messages[after.status]));
      }
    };

    container.onsubmit = (event) => {
      if (event.target.id !== 'refund-form') return;
      event.preventDefault();
      const form = event.target;
      const txn = store.getById(id);

      const amountText = qs('#refund-amount', form).value;
      const reason = qs('#refund-reason', form).value;
      const amount = parseAmountToPaise(amountText);

      // Field-level checks first so each message sits next to its field.
      let amountError = null;
      if (amountText.trim() === '') amountError = 'Enter a refund amount';
      else if (amount === null) amountError = 'Enter an amount in rupees, like 300 or 299.50';
      else if (amount <= 0) amountError = 'Refund must be more than ₹0';
      else if (amount > refundableAmount(txn)) amountError = `Refund can’t be more than ${formatINR(refundableAmount(txn))}`;
      const reasonError = reason ? null : 'Choose a reason for the refund';

      setError(form, 'amount', amountError);
      setError(form, 'reason', reasonError);
      if (amountError || reasonError) {
        qs(amountError ? '#refund-amount' : '#refund-reason', form).focus();
        return;
      }

      try {
        const updated = applyRefund(txn, { amount, reason });
        const saved = store.update(updated);
        const fully = updated.status === 'refunded';
        const message = fully
          ? `Refund of ${formatINR(amount)} processed. This payment is now fully refunded.`
          : `Refund of ${formatINR(amount)} processed. ${formatINR(refundableAmount(updated))} can still be refunded.`;
        draw(flashMessage(saved ? message : `${message} Your browser didn’t save this change.`));
      } catch (err) {
        if (!(err instanceof RefundError)) throw err;
        setError(form, 'amount', err.message);
        qs('#refund-amount', form).focus();
      }
    };
  },
};
