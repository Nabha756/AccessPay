// Pure functions for working with transaction lists.
// No DOM or storage access here, which is what makes them easy to unit test.

const DAY = 24 * 60 * 60 * 1000;

export const STATUSES = ['success', 'pending', 'failed', 'refunded'];

/** Total amount refunded so far for one transaction (in paise). */
export function refundedTotal(txn) {
  return (txn.refunds ?? []).reduce((sum, r) => sum + r.amount, 0);
}

/** What the payment actually cost after refunds. Failed/pending cost nothing. */
export function netAmount(txn) {
  if (txn.status === 'success' || txn.status === 'refunded') {
    return txn.amount - refundedTotal(txn);
  }
  return 0;
}

export function newestFirst(a, b) {
  return new Date(b.createdAt) - new Date(a.createdAt);
}

/** Counts and amounts per status, used by the overview KPI strip. */
export function computeStats(transactions) {
  const stats = {
    total: { count: transactions.length, amount: 0 },
    success: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    failed: { count: 0, amount: 0 },
    refunded: { count: 0, amount: 0 },
  };

  for (const txn of transactions) {
    const bucket = stats[txn.status];
    if (!bucket) continue; // ignore unknown statuses rather than crash
    bucket.count += 1;
    bucket.amount += txn.amount;
    stats.total.amount += netAmount(txn);
  }

  return stats;
}

export function recentTransactions(transactions, limit = 5) {
  return transactions.slice().sort(newestFirst).slice(0, limit);
}

/**
 * Summary for the last `days` days: money sent, refunds, success rate and a
 * per-method breakdown of successful payments.
 */
export function periodSummary(transactions, { now = Date.now(), days = 30 } = {}) {
  const since = now - days * DAY;
  const inPeriod = transactions.filter((t) => new Date(t.createdAt).getTime() >= since);

  let sent = 0;
  let refunds = 0;
  let completed = 0;
  let failed = 0;
  const byMethod = {};

  for (const txn of inPeriod) {
    if (txn.status === 'failed') failed += 1;
    if (txn.status !== 'success' && txn.status !== 'refunded') continue;

    completed += 1;
    sent += netAmount(txn);
    refunds += refundedTotal(txn);

    byMethod[txn.method] ??= { method: txn.method, count: 0, amount: 0 };
    byMethod[txn.method].count += 1;
    byMethod[txn.method].amount += netAmount(txn);
  }

  // Success rate only counts payments that reached a final outcome.
  const finished = completed + failed;

  return {
    days,
    count: inPeriod.length,
    sent,
    refunds,
    successRate: finished === 0 ? null : Math.round((completed / finished) * 100),
    byMethod: Object.values(byMethod).sort((a, b) => b.amount - a.amount),
  };
}

/* ------------------------------------------------------------------ */
/* Search, filter and sort (transaction history page)                  */
/* ------------------------------------------------------------------ */

export const SORT_OPTIONS = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'amount-desc': 'Amount, high to low',
  'amount-asc': 'Amount, low to high',
};

/** Case-insensitive match on recipient name, transaction ID or UPI ID/account. */
export function searchTransactions(transactions, term) {
  const needle = term.trim().toLowerCase();
  if (needle === '') return transactions;
  return transactions.filter((t) =>
    t.recipientName.toLowerCase().includes(needle)
    || t.id.toLowerCase().includes(needle)
    || t.payeeId.toLowerCase().includes(needle));
}

export function filterByStatus(transactions, status) {
  if (!status || status === 'all') return transactions;
  return transactions.filter((t) => t.status === status);
}

export function sortTransactions(transactions, sortKey = 'date-desc') {
  const byDateDesc = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const comparators = {
    'date-desc': byDateDesc,
    'date-asc': (a, b) => -byDateDesc(a, b),
    // Equal amounts fall back to newest first so the order is predictable.
    'amount-desc': (a, b) => (b.amount - a.amount) || byDateDesc(a, b),
    'amount-asc': (a, b) => (a.amount - b.amount) || byDateDesc(a, b),
  };
  const compare = comparators[sortKey] ?? byDateDesc;
  return transactions.slice().sort(compare);
}

/** Applies search, status filter and sort in one go. */
export function queryTransactions(transactions, { search = '', status = 'all', sort = 'date-desc' } = {}) {
  return sortTransactions(filterByStatus(searchTransactions(transactions, search), status), sort);
}

/* ------------------------------------------------------------------ */
/* Refunds                                                             */
/* ------------------------------------------------------------------ */

export const REFUND_WINDOW_DAYS = 30;

export const REFUND_REASONS = [
  'Duplicate payment',
  'Paid the wrong amount',
  'Order or booking cancelled',
  'Item returned',
  'Other',
];

export function refundableAmount(txn) {
  if (txn.status !== 'success') return 0;
  return txn.amount - refundedTotal(txn);
}

/**
 * Whether a refund can be started, and if not, a message explaining why.
 * Only successful payments within the refund window can be refunded.
 */
export function canRefund(txn, now = Date.now()) {
  if (txn.status === 'refunded') return { allowed: false, reason: 'This payment has already been fully refunded.' };
  if (txn.status === 'failed') return { allowed: false, reason: 'Failed payments can’t be refunded because no money was debited.' };
  if (txn.status === 'pending') return { allowed: false, reason: 'Refunds can be requested once the bank confirms this payment.' };

  const ageDays = (now - new Date(txn.createdAt).getTime()) / DAY;
  if (ageDays > REFUND_WINDOW_DAYS) {
    return { allowed: false, reason: `Refunds are only available for ${REFUND_WINDOW_DAYS} days after a payment.` };
  }
  if (refundableAmount(txn) <= 0) return { allowed: false, reason: 'Nothing left to refund on this payment.' };
  return { allowed: true, reason: null };
}

export class RefundError extends Error {}

/**
 * Returns a NEW transaction with the refund recorded (the original object is
 * not modified). A refund of the full remaining amount marks it "refunded";
 * a partial refund keeps it "success" with the refund listed.
 * Throws RefundError with a user-facing message if the refund isn't allowed.
 */
export function applyRefund(txn, { amount, reason }, now = Date.now()) {
  const check = canRefund(txn, now);
  if (!check.allowed) throw new RefundError(check.reason);

  const remaining = refundableAmount(txn);
  if (!Number.isInteger(amount) || amount <= 0) throw new RefundError('Enter a refund amount of at least ₹0.01');
  if (amount > remaining) throw new RefundError('Refund can’t be more than the amount left to refund');
  if (!reason) throw new RefundError('Choose a reason for the refund');

  const refunds = [...(txn.refunds ?? []), { amount, reason, createdAt: new Date(now).toISOString() }];
  return {
    ...txn,
    refunds,
    status: amount === remaining ? 'refunded' : 'success',
  };
}
