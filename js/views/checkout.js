// Payment checkout: details form -> review -> processing -> result.
//
// The whole flow lives on one route (#/pay). `state.step` decides which
// screen is drawn; each step change re-renders and moves focus to the new
// heading so keyboard and screen-reader users know the screen changed.

import { escapeHtml, icon, announce, focusHeading, qs } from '../lib/dom.js';
import { formatINR, formatDateTime, methodLabel } from '../lib/format.js';
import { amountToWords } from '../lib/amount-words.js';
import { validateCheckout, parseAmountToPaise, METHOD_LIMITS, NOTE_MAX_LENGTH } from '../lib/validation.js';
import { processPayment, DEMO_TRIGGERS } from '../lib/payment.js';

// The demo "accounts" the user can pay from. No real card or bank details
// are ever entered.
const PAY_FROM = [
  { method: 'upi', title: 'UPI', detail: 'Demo Savings Account ending 4821' },
  { method: 'card', title: 'Debit card', detail: 'Demo Visa Debit ending 0042' },
  { method: 'netbanking', title: 'Net banking', detail: 'Demo Bank of Pune' },
];

// Order matters: it's the order fields appear in, used by the error summary.
const FIELD_ORDER = ['recipientName', 'upiId', 'accountNumber', 'confirmAccount', 'ifsc', 'amount', 'method', 'note'];

const FIELD_IDS = {
  recipientName: 'recipient-name',
  upiId: 'upi-id',
  accountNumber: 'account-number',
  confirmAccount: 'confirm-account',
  ifsc: 'ifsc',
  amount: 'amount',
  method: 'method-upi', // focus the first radio in the group
  note: 'note',
};

const EMPTY_VALUES = {
  recipientName: '', payeeType: 'upi', upiId: '', accountNumber: '',
  confirmAccount: '', ifsc: '', amount: '', method: '', note: '',
};

// Incremented on every render of this view. A payment that finishes after
// the user has navigated elsewhere still gets saved, but must not draw
// over whatever page they are on now.
let renderToken = 0;

/* ------------------------------------------------------------------ */
/* Small markup helpers                                                */
/* ------------------------------------------------------------------ */

function errorMarkup(message) {
  if (!message) return '';
  return `${icon('alert')}<span><span class="visually-hidden">Error: </span>${escapeHtml(message)}</span>`;
}

function textField({ name, label, hint = '', value, error, type = 'text', attrs = '', describedByExtra = '' }) {
  const id = FIELD_IDS[name];
  const describedBy = [hint && `${id}-hint`, `${id}-error`, describedByExtra].filter(Boolean).join(' ');
  return `
    <div class="field" id="field-${id}">
      <label for="${id}">${label}</label>
      ${hint ? `<span class="hint" id="${id}-hint">${hint}</span>` : ''}
      <p class="error-msg" id="${id}-error">${errorMarkup(error)}</p>
      <input class="input" type="${type}" id="${id}" name="${name}" value="${escapeHtml(value)}"
        aria-describedby="${describedBy}" ${error ? 'aria-invalid="true"' : ''} ${attrs}>
    </div>`;
}

function stepIndicator(current) {
  const steps = ['Details', 'Review', 'Done'];
  return `
    <ol class="steps" aria-label="Checkout progress">
      ${steps.map((label, i) => `
        <li ${i === current ? 'aria-current="step"' : ''} class="${i < current ? 'is-done' : ''}">
          <span class="steps__num" aria-hidden="true">${i + 1}</span>
          <span>${label}${i < current ? '<span class="visually-hidden"> (completed)</span>' : ''}</span>
        </li>`).join('')}
    </ol>`;
}

function payeeLine(payment) {
  return payment.payeeType === 'bank' ? `Bank account ${payment.payeeId}` : payment.payeeId;
}

/* ------------------------------------------------------------------ */
/* Step 1: details form                                                */
/* ------------------------------------------------------------------ */

function renderErrorSummary(errors) {
  const fields = FIELD_ORDER.filter((f) => errors[f]);
  if (fields.length === 0) return '';
  return `
    <div class="notice notice--error error-summary" id="error-summary" tabindex="-1" role="region" aria-labelledby="error-summary-title">
      <h2 id="error-summary-title">Fix ${fields.length === 1 ? '1 problem' : `${fields.length} problems`} to continue</h2>
      <ul>
        ${fields.map((f) => `<li><a href="#${FIELD_IDS[f]}" data-focus="${FIELD_IDS[f]}">${escapeHtml(errors[f])}</a></li>`).join('')}
      </ul>
    </div>`;
}

function renderForm(state) {
  const v = state.values;
  const e = state.errors;
  const isBank = v.payeeType === 'bank';
  const paise = parseAmountToPaise(v.amount);

  return `
    <div class="page-head">
      <div>
        <h1>Make a payment</h1>
        <p>Send money to a UPI ID or bank account. All fields are required unless marked optional.</p>
      </div>
    </div>
    ${stepIndicator(0)}
    ${renderErrorSummary(e)}

    <form class="form panel panel__body" id="checkout-form" novalidate>
      ${textField({
        name: 'recipientName', label: 'Recipient name', value: v.recipientName, error: e.recipientName,
        attrs: 'autocomplete="off" spellcheck="false"',
      })}

      <div class="field">
        <fieldset>
          <legend>Pay to</legend>
          <div class="segmented">
            <label><input type="radio" name="payeeType" value="upi" ${!isBank ? 'checked' : ''}><span>UPI ID</span></label>
            <label><input type="radio" name="payeeType" value="bank" ${isBank ? 'checked' : ''}><span>Bank account</span></label>
          </div>
        </fieldset>
      </div>

      <div id="upi-fields" ${isBank ? 'hidden' : ''}>
        ${textField({
          name: 'upiId', label: 'UPI ID', hint: 'For example, meera.joshi@okdemo', value: v.upiId, error: e.upiId,
          attrs: 'autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="email"',
        })}
      </div>

      <div id="bank-fields" ${isBank ? '' : 'hidden'}>
        ${textField({
          name: 'accountNumber', label: 'Account number', hint: '9 to 18 digits', value: v.accountNumber, error: e.accountNumber,
          attrs: 'autocomplete="off" inputmode="numeric"',
        })}
        ${textField({
          name: 'confirmAccount', label: 'Confirm account number', value: v.confirmAccount, error: e.confirmAccount,
          attrs: 'autocomplete="off" inputmode="numeric"',
        })}
        ${textField({
          name: 'ifsc', label: 'IFSC code', hint: '11 characters, printed on the recipient’s cheque book or passbook',
          value: v.ifsc, error: e.ifsc, attrs: 'autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="11"',
        })}
      </div>

      <div class="field" id="field-amount">
        <label for="amount">Amount in rupees</label>
        <span class="hint" id="amount-hint">Minimum ₹1. The limit depends on how you pay.</span>
        <p class="error-msg" id="amount-error">${errorMarkup(e.amount)}</p>
        <div class="money-input">
          <span class="money-input__symbol" aria-hidden="true">₹</span>
          <input class="input" type="text" id="amount" name="amount" value="${escapeHtml(v.amount)}"
            inputmode="decimal" autocomplete="off"
            aria-describedby="amount-hint amount-error amount-words" ${e.amount ? 'aria-invalid="true"' : ''}>
        </div>
        <p class="amount-words" id="amount-words">${paise ? escapeHtml(amountToWords(paise)) : ''}</p>
      </div>

      <div class="field" id="field-method">
        <fieldset aria-describedby="method-error">
          <legend>Pay from</legend>
          <p class="error-msg" id="method-error">${errorMarkup(e.method)}</p>
          <div class="choices">
            ${PAY_FROM.map((opt) => `
              <label class="choice">
                <input type="radio" name="method" id="method-${opt.method}" value="${opt.method}"
                  ${v.method === opt.method ? 'checked' : ''} ${e.method ? 'aria-invalid="true"' : ''}>
                <span class="choice__text">
                  <span class="choice__title">${opt.title}</span>
                  <span class="choice__detail">${opt.detail}. Up to ₹${METHOD_LIMITS[opt.method].toLocaleString('en-IN')} per payment.</span>
                </span>
              </label>`).join('')}
          </div>
        </fieldset>
      </div>

      ${textField({
        name: 'note', label: 'Note (optional)', hint: `Shown in your history. Up to ${NOTE_MAX_LENGTH} characters.`,
        value: v.note, error: e.note, attrs: 'autocomplete="off"',
      })}

      <details class="demo-tips">
        <summary>Demo tips: see a failed or pending payment</summary>
        <p>Payments are simulated and usually succeed. To see other outcomes, pay
          <strong>${DEMO_TRIGGERS.fail}</strong> (always fails),
          <strong>${DEMO_TRIGGERS.pending}</strong> (stays pending), or a bank account ending in
          <strong>0000</strong> (always fails).</p>
      </details>

      <div class="btn-row form-actions">
        <button type="submit" class="btn btn--primary">Review payment</button>
        <a class="btn btn--secondary" href="#/">Cancel</a>
      </div>
    </form>`;
}

/** Reads the current form inputs into a plain object of strings. */
function readForm(form) {
  const data = new FormData(form);
  const values = { ...EMPTY_VALUES };
  for (const key of Object.keys(values)) values[key] = String(data.get(key) ?? '');
  values.payeeType = values.payeeType || 'upi';
  return values;
}

/** Updates one field's error message in place, without re-rendering the form. */
function showFieldError(container, name, message) {
  const id = FIELD_IDS[name];
  const errorEl = qs(name === 'method' ? '#method-error' : `#${id}-error`, container);
  if (!errorEl) return;
  errorEl.innerHTML = errorMarkup(message);

  const inputs = name === 'method'
    ? container.querySelectorAll('input[name="method"]')
    : [qs(`#${id}`, container)];
  inputs.forEach((input) => {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  });
}

function bindForm(container, state, ctx) {
  const form = qs('#checkout-form', container);
  const amountInput = qs('#amount', form);
  const amountWords = qs('#amount-words', form);

  // Error summary links: focus the field instead of changing the URL hash
  // (the router owns the hash).
  container.addEventListener('click', (event) => {
    const link = event.target.closest('[data-focus]');
    if (!link) return;
    event.preventDefault();
    qs(`#${link.dataset.focus}`, container)?.focus();
  });

  form.addEventListener('change', (event) => {
    if (event.target.name === 'payeeType') {
      const isBank = event.target.value === 'bank';
      qs('#upi-fields', form).hidden = isBank;
      qs('#bank-fields', form).hidden = !isBank;
    }
  });

  amountInput.addEventListener('input', () => {
    const paise = parseAmountToPaise(amountInput.value);
    amountWords.textContent = paise ? amountToWords(paise) : '';
  });

  // After the first submit attempt, re-check fields as the user fixes them
  // so errors disappear as soon as they're resolved. Before that we stay
  // quiet: shouting "required" at someone who hasn't typed yet is unhelpful.
  const recheck = () => {
    if (!state.submitted) return;
    const { errors } = validateCheckout(readForm(form));
    for (const name of FIELD_ORDER) showFieldError(container, name, errors[name]);
  };
  form.addEventListener('focusout', recheck);
  form.addEventListener('change', recheck);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.submitted = true;
    state.values = readForm(form);
    const result = validateCheckout(state.values);
    state.errors = result.errors;

    if (!result.valid) {
      draw(container, state, ctx);
      qs('#error-summary', container).focus();
      return;
    }

    state.payment = result.payment;
    state.step = 'review';
    draw(container, state, ctx);
  });
}

/* ------------------------------------------------------------------ */
/* Step 2: review and pay                                              */
/* ------------------------------------------------------------------ */

function renderReview(state) {
  const p = state.payment;
  const processing = state.step === 'processing';
  const payFrom = PAY_FROM.find((o) => o.method === p.method);

  return `
    <div class="page-head"><div><h1>Review payment</h1><p>Check the details before you pay.</p></div></div>
    ${stepIndicator(1)}
    <section class="panel review" aria-labelledby="review-amount" ${processing ? 'aria-busy="true"' : ''}>
      <div class="review__amount">
        <p class="review__figure amount" id="review-amount">${formatINR(p.amount)}</p>
        <p class="review__words">${escapeHtml(amountToWords(p.amount))}</p>
      </div>
      <dl class="details-list">
        <div><dt>To</dt><dd>${escapeHtml(p.recipientName)}</dd></div>
        <div><dt>${p.payeeType === 'bank' ? 'Account' : 'UPI ID'}</dt><dd>${escapeHtml(p.payeeId)}</dd></div>
        <div><dt>Pay from</dt><dd>${payFrom.title}, ${payFrom.detail}</dd></div>
        ${p.note ? `<div><dt>Note</dt><dd>${escapeHtml(p.note)}</dd></div>` : ''}
      </dl>
    </section>
    <p class="muted review__disclaimer">This is a simulation. You won’t be asked for a UPI PIN, card number or bank password.</p>
    <div class="btn-row">
      <button type="button" class="btn btn--primary" id="pay-button" ${processing ? 'aria-disabled="true"' : ''}>
        ${processing ? 'Processing payment…' : `Pay ${formatINR(p.amount)}`}
      </button>
      <button type="button" class="btn btn--secondary" id="edit-button" ${processing ? 'aria-disabled="true"' : ''}>Edit details</button>
    </div>`;
}

function bindReview(container, state, ctx) {
  const payButton = qs('#pay-button', container);
  const editButton = qs('#edit-button', container);

  editButton.addEventListener('click', () => {
    if (state.step === 'processing') return;
    state.step = 'form';
    draw(container, state, ctx);
  });

  payButton.addEventListener('click', () => {
    // aria-disabled (rather than disabled) keeps the button focusable, so
    // focus isn't lost while processing. That means we must guard clicks.
    if (state.step === 'processing') return;
    submitPayment(container, state, ctx);
  });
}

async function submitPayment(container, state, ctx) {
  const myToken = renderToken;
  state.step = 'processing';

  // Update the buttons in place so focus stays on "Pay".
  const payButton = qs('#pay-button', container);
  payButton.textContent = 'Processing payment…';
  payButton.setAttribute('aria-disabled', 'true');
  qs('#edit-button', container).setAttribute('aria-disabled', 'true');
  qs('.review', container).setAttribute('aria-busy', 'true');
  announce('Processing payment, please wait.');

  let txn;
  try {
    txn = await processPayment(state.payment, {
      isTaken: (id) => ctx.store.hasId(id),
    });
  } catch (err) {
    // The simulator shouldn't throw, but if it does, don't leave the user stuck.
    console.error('AccessPay: payment simulation error', err);
    state.step = 'review';
    if (myToken === renderToken) {
      draw(container, state, ctx);
      announce('Something went wrong before the payment was sent. No money was debited. Try again.', { assertive: true });
    }
    return;
  }

  const saved = ctx.store.add(txn);

  // User left the page while we were "processing": the payment is saved
  // to history, but we don't draw the result over another page.
  if (myToken !== renderToken) {
    announce(`Payment to ${txn.recipientName} ${txn.status === 'success' ? 'was successful' : `is ${txn.status}`}.`);
    return;
  }

  state.result = { txn, saved };
  state.step = 'result';
  draw(container, state, ctx);
}

/* ------------------------------------------------------------------ */
/* Step 3: result                                                      */
/* ------------------------------------------------------------------ */

const RESULT_COPY = {
  success: {
    heading: 'Payment successful',
    body: (t) => `${formatINR(t.amount)} sent to ${escapeHtml(t.recipientName)}.`,
  },
  pending: {
    heading: 'Payment pending',
    body: (t) => `Your bank hasn’t confirmed the payment of ${formatINR(t.amount)} to ${escapeHtml(t.recipientName)} yet. You can check its status from the transaction page.`,
  },
  failed: {
    heading: 'Payment failed',
    body: (t) => escapeHtml(t.failureReason ?? 'The payment could not be completed. No money was debited.'),
  },
};

function renderResult(state) {
  const { txn, saved } = state.result;
  const copy = RESULT_COPY[txn.status];
  const iconName = txn.status;

  return `
    ${stepIndicator(2)}
    <section class="panel result result--${txn.status}" aria-labelledby="result-heading">
      <div class="result__head">
        <span class="result__icon">${icon(iconName)}</span>
        <div>
          <h1 id="result-heading">${copy.heading}</h1>
          <p>${copy.body(txn)}</p>
        </div>
      </div>
      <dl class="details-list">
        <div><dt>Transaction ID</dt><dd><span class="txn-id">${escapeHtml(txn.id)}</span></dd></div>
        <div><dt>Amount</dt><dd class="amount">${formatINR(txn.amount)}</dd></div>
        <div><dt>To</dt><dd>${escapeHtml(txn.recipientName)}, ${escapeHtml(payeeLine(txn))}</dd></div>
        <div><dt>Paid with</dt><dd>${methodLabel(txn.method)}</dd></div>
        <div><dt>Date and time</dt><dd>${formatDateTime(txn.createdAt)}</dd></div>
      </dl>
    </section>
    ${saved ? '' : `
      <div class="notice notice--error" role="alert">
        <h2>Not saved to your history</h2>
        <p>Your browser didn’t let AccessPay save this transaction, so it will disappear when you close the tab.</p>
      </div>`}
    <div class="btn-row">
      ${txn.status === 'failed' ? `
        <button type="button" class="btn btn--primary" id="retry-button">Try again</button>
        <button type="button" class="btn btn--secondary" id="edit-again-button">Edit details</button>
      ` : `
        <a class="btn btn--primary" href="#/transactions/${encodeURIComponent(txn.id)}">View transaction</a>
        <button type="button" class="btn btn--secondary" id="new-payment-button">Make another payment</button>
      `}
      <a class="btn btn--secondary" href="#/">Back to overview</a>
    </div>`;
}

function bindResult(container, state, ctx) {
  qs('#retry-button', container)?.addEventListener('click', () => {
    state.step = 'review';
    draw(container, state, ctx);
  });
  qs('#edit-again-button', container)?.addEventListener('click', () => {
    state.step = 'form';
    draw(container, state, ctx);
  });
  qs('#new-payment-button', container)?.addEventListener('click', () => {
    Object.assign(state, freshState());
    draw(container, state, ctx);
  });
}

/* ------------------------------------------------------------------ */

function freshState(prefill = {}) {
  return {
    step: 'form',
    values: { ...EMPTY_VALUES, ...prefill },
    errors: {},
    submitted: false,
    payment: null,
    result: null,
  };
}

/**
 * Draws the current step. A fresh wrapper element is used each time so old
 * event listeners are dropped along with the old markup.
 */
function draw(container, state, ctx, { moveFocus = true } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'checkout';

  if (state.step === 'form') {
    wrapper.innerHTML = renderForm(state);
    container.replaceChildren(wrapper);
    bindForm(wrapper, state, ctx);
  } else if (state.step === 'review' || state.step === 'processing') {
    wrapper.innerHTML = renderReview(state);
    container.replaceChildren(wrapper);
    bindReview(wrapper, state, ctx);
  } else {
    wrapper.innerHTML = renderResult(state);
    container.replaceChildren(wrapper);
    bindResult(wrapper, state, ctx);
  }

  if (moveFocus) focusHeading(wrapper);
}

export const checkoutView = {
  title: 'Make a payment',
  render(container, { store, query }) {
    renderToken += 1;
    const prefill = {};
    // "Pay again" from a transaction page passes ?repeat=<id>.
    const repeatOf = query?.get('repeat') && store.getById(query.get('repeat'));
    if (repeatOf && repeatOf.payeeType === 'upi') {
      Object.assign(prefill, {
        recipientName: repeatOf.recipientName,
        upiId: repeatOf.payeeId,
        method: repeatOf.method,
      });
    }
    // The router handles focus for the initial render.
    draw(container, freshState(prefill), { store }, { moveFocus: false });
  },
};
