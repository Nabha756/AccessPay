import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStats, recentTransactions, periodSummary, netAmount, refundedTotal,
} from '../../js/lib/transactions.js';
import { createSeedTransactions } from '../../js/data/seed.js';
import { makeTxn } from './helpers.js';

const NOW = new Date('2026-11-13T12:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

test('computeStats on an empty list returns zeros', () => {
  const stats = computeStats([]);
  assert.equal(stats.total.count, 0);
  assert.equal(stats.total.amount, 0);
  assert.equal(stats.failed.count, 0);
});

test('computeStats counts by status and nets refunds out of the total', () => {
  const stats = computeStats([
    makeTxn({ id: 'a', amount: 50000, status: 'success' }),
    makeTxn({ id: 'b', amount: 20000, status: 'success', refunds: [{ amount: 5000 }] }),
    makeTxn({ id: 'c', amount: 30000, status: 'pending' }),
    makeTxn({ id: 'd', amount: 10000, status: 'failed' }),
    makeTxn({ id: 'e', amount: 8000, status: 'refunded', refunds: [{ amount: 8000 }] }),
  ]);
  assert.equal(stats.total.count, 5);
  assert.equal(stats.success.count, 2);
  assert.equal(stats.success.amount, 70000);
  assert.equal(stats.pending.amount, 30000);
  assert.equal(stats.failed.count, 1);
  // Only completed money counts: 50000 + (20000 - 5000) + (8000 - 8000)
  assert.equal(stats.total.amount, 65000);
});

test('netAmount and refundedTotal', () => {
  assert.equal(refundedTotal(makeTxn()), 0);
  assert.equal(netAmount(makeTxn({ amount: 1000, refunds: [{ amount: 300 }, { amount: 200 }] })), 500);
  assert.equal(netAmount(makeTxn({ amount: 1000, status: 'failed' })), 0);
  assert.equal(netAmount(makeTxn({ amount: 1000, status: 'pending' })), 0);
});

test('recentTransactions returns newest first without mutating input', () => {
  const list = [
    makeTxn({ id: 'old', createdAt: daysAgo(5) }),
    makeTxn({ id: 'new', createdAt: daysAgo(0) }),
    makeTxn({ id: 'mid', createdAt: daysAgo(2) }),
  ];
  assert.deepEqual(recentTransactions(list, 2).map((t) => t.id), ['new', 'mid']);
  assert.equal(list[0].id, 'old');
});

test('periodSummary only counts the requested window', () => {
  const summary = periodSummary([
    makeTxn({ id: 'in', amount: 40000, method: 'upi', createdAt: daysAgo(3) }),
    makeTxn({ id: 'card', amount: 10000, method: 'card', createdAt: daysAgo(10), refunds: [{ amount: 2500 }] }),
    makeTxn({ id: 'fail', amount: 99999, status: 'failed', createdAt: daysAgo(1) }),
    makeTxn({ id: 'old', amount: 70000, createdAt: daysAgo(45) }),
  ], { now: NOW, days: 30 });

  assert.equal(summary.count, 3);
  assert.equal(summary.sent, 40000 + 7500);
  assert.equal(summary.refunds, 2500);
  assert.equal(summary.successRate, 67); // 2 completed of 3 finished
  assert.deepEqual(summary.byMethod.map((m) => m.method), ['upi', 'card']);
});

test('periodSummary success rate is null when nothing has finished', () => {
  const summary = periodSummary([makeTxn({ status: 'pending', createdAt: daysAgo(1) })], { now: NOW });
  assert.equal(summary.successRate, null);
});

test('seed data is valid: unique ids, integer paise, known statuses, no future dates', () => {
  const seed = createSeedTransactions(NOW);
  const ids = new Set(seed.map((t) => t.id));
  assert.equal(ids.size, seed.length);
  for (const t of seed) {
    assert.ok(Number.isInteger(t.amount) && t.amount > 0, `${t.id} amount`);
    assert.ok(['success', 'pending', 'failed', 'refunded'].includes(t.status), `${t.id} status`);
    assert.ok(new Date(t.createdAt).getTime() <= NOW, `${t.id} is in the future`);
    if (t.status === 'failed') assert.ok(t.failureReason, `${t.id} needs a failure reason`);
    if (t.status === 'refunded') assert.equal(refundedTotal(t), t.amount, `${t.id} fully refunded`);
  }
});
