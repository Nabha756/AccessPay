import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchTransactions, filterByStatus, sortTransactions, queryTransactions,
  canRefund, applyRefund, refundableAmount, RefundError,
} from '../../js/lib/transactions.js';
import { checkPendingStatus } from '../../js/lib/payment.js';
import { makeTxn } from './helpers.js';

const NOW = new Date('2026-11-13T12:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

const list = [
  makeTxn({ id: 'AP2611130001', recipientName: 'Meera Joshi', payeeId: 'meera.joshi@okdemo', amount: 125000, status: 'success', createdAt: daysAgo(0) }),
  makeTxn({ id: 'AP2611120002', recipientName: 'Rohan Patil', payeeId: 'XXXXXX4417 · DEMO0001021', amount: 1500000, status: 'success', createdAt: daysAgo(1) }),
  makeTxn({ id: 'AP2611100003', recipientName: 'Aditya Kulkarni', payeeId: 'aditya.k@okdemo', amount: 64000, status: 'failed', createdAt: daysAgo(3) }),
  makeTxn({ id: 'AP2611050004', recipientName: 'meera stores', payeeId: 'meerastores@demopay', amount: 64000, status: 'pending', createdAt: daysAgo(8) }),
];
const ids = (rows) => rows.map((t) => t.id.slice(-1));

test('search matches recipient name case-insensitively', () => {
  assert.deepEqual(ids(searchTransactions(list, 'MEERA')), ['1', '4']);
});

test('search matches transaction ID and UPI ID; blank search returns everything', () => {
  assert.deepEqual(ids(searchTransactions(list, 'ap26111000')), ['3']);
  assert.deepEqual(ids(searchTransactions(list, 'aditya.k@')), ['3']);
  assert.equal(searchTransactions(list, '   ').length, 4);
  assert.equal(searchTransactions(list, 'nobody').length, 0);
});

test('filter by status', () => {
  assert.deepEqual(ids(filterByStatus(list, 'failed')), ['3']);
  assert.equal(filterByStatus(list, 'all').length, 4);
  assert.equal(filterByStatus(list, 'refunded').length, 0);
});

test('sort by date and amount, with newest-first tie-break for equal amounts', () => {
  assert.deepEqual(ids(sortTransactions(list, 'date-asc')), ['4', '3', '2', '1']);
  assert.deepEqual(ids(sortTransactions(list, 'amount-desc')), ['2', '1', '3', '4']);
  assert.deepEqual(ids(sortTransactions(list, 'amount-asc')), ['3', '4', '1', '2']);
  assert.deepEqual(ids(sortTransactions(list, 'nonsense')), ['1', '2', '3', '4'], 'unknown key falls back to newest first');
  assert.equal(list[0].id.slice(-1), '1', 'input not mutated');
});

test('queryTransactions combines search, filter and sort', () => {
  assert.deepEqual(ids(queryTransactions(list, { search: 'meera', status: 'success', sort: 'date-asc' })), ['1']);
});

test('canRefund: only recent successful payments', () => {
  assert.equal(canRefund(makeTxn({ createdAt: daysAgo(5) }), NOW).allowed, true);
  assert.match(canRefund(makeTxn({ status: 'failed', createdAt: daysAgo(1) }), NOW).reason, /no money was debited/);
  assert.match(canRefund(makeTxn({ status: 'pending', createdAt: daysAgo(1) }), NOW).reason, /once the bank confirms/);
  assert.match(canRefund(makeTxn({ status: 'refunded', createdAt: daysAgo(1) }), NOW).reason, /already been fully refunded/);
  assert.match(canRefund(makeTxn({ createdAt: daysAgo(31) }), NOW).reason, /30 days/);
  assert.equal(canRefund(makeTxn({ createdAt: daysAgo(29.9) }), NOW).allowed, true);
});

test('partial refund keeps status success and records the refund', () => {
  const original = makeTxn({ amount: 86500, createdAt: daysAgo(2) });
  const updated = applyRefund(original, { amount: 30000, reason: 'Item returned' }, NOW);
  assert.equal(updated.status, 'success');
  assert.equal(updated.refunds.length, 1);
  assert.equal(refundableAmount(updated), 56500);
  assert.equal(original.refunds.length, 0, 'original object not modified');
});

test('refunding the remaining amount marks the payment refunded', () => {
  const partly = applyRefund(makeTxn({ amount: 86500, createdAt: daysAgo(2) }), { amount: 30000, reason: 'Item returned' }, NOW);
  const full = applyRefund(partly, { amount: 56500, reason: 'Item returned' }, NOW);
  assert.equal(full.status, 'refunded');
  assert.equal(refundableAmount(full), 0);
  assert.throws(() => applyRefund(full, { amount: 1, reason: 'Other' }, NOW), RefundError);
});

test('refund rejects bad amounts and missing reasons', () => {
  const txn = makeTxn({ amount: 10000, createdAt: daysAgo(1) });
  assert.throws(() => applyRefund(txn, { amount: 10001, reason: 'Other' }, NOW), /more than the amount left/);
  assert.throws(() => applyRefund(txn, { amount: 0, reason: 'Other' }, NOW), /at least/);
  assert.throws(() => applyRefund(txn, { amount: 12.5, reason: 'Other' }, NOW), /at least/);
  assert.throws(() => applyRefund(txn, { amount: 100, reason: '' }, NOW), /Choose a reason/);
});

test('checkPendingStatus resolves pending payments', async () => {
  const pending = makeTxn({ status: 'pending' });
  assert.equal((await checkPendingStatus(pending, { random: () => 0.1, delayMs: 0 })).status, 'success');
  const failed = await checkPendingStatus(pending, { random: () => 0.9, delayMs: 0 });
  assert.equal(failed.status, 'failed');
  assert.match(failed.failureReason, /No money was debited/);
  assert.equal(pending.status, 'pending', 'original not modified');
});

test('checkPendingStatus leaves the pending demo ID and non-pending payments alone', async () => {
  const demo = makeTxn({ status: 'pending', payeeId: 'pending@okdemo' });
  assert.equal((await checkPendingStatus(demo, { random: () => 0.1, delayMs: 0 })).status, 'pending');
  const done = makeTxn({ status: 'success' });
  assert.equal(await checkPendingStatus(done, { delayMs: 0 }), done);
});
