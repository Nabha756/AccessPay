import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideOutcome, generateTransactionId, processPayment, DEMO_TRIGGERS } from '../../js/lib/payment.js';

const base = { recipientName: 'Meera', payeeType: 'upi', payeeId: 'meera@okdemo', accountLast4: null, amount: 1000, method: 'upi', note: '' };
const always = (value) => () => value;

test('a normal roll succeeds', () => {
  assert.equal(decideOutcome(base, always(0.5)).status, 'success');
});

test('a low roll fails with a reason that says no money was debited', () => {
  const outcome = decideOutcome(base, always(0.01));
  assert.equal(outcome.status, 'failed');
  assert.match(outcome.failureReason, /No money was debited/);
});

test('net banking is more likely to be pending', () => {
  // 0.15 is past net banking's 6% failure chance and inside its 12% pending
  // band (0.06 to 0.18), but past both UPI bands (0 to 0.11).
  assert.equal(decideOutcome({ ...base, method: 'netbanking' }, always(0.15)).status, 'pending');
  assert.equal(decideOutcome({ ...base, method: 'upi' }, always(0.15)).status, 'success');
});

test('demo trigger IDs give fixed outcomes regardless of the roll', () => {
  assert.equal(decideOutcome({ ...base, payeeId: DEMO_TRIGGERS.fail }, always(0.99)).status, 'failed');
  assert.equal(decideOutcome({ ...base, payeeId: DEMO_TRIGGERS.pending }, always(0.99)).status, 'pending');
  assert.equal(decideOutcome({ ...base, payeeType: 'bank', accountLast4: '0000', method: 'netbanking' }, always(0.99)).status, 'failed');
});

test('transaction ids follow AP + yymmdd + 4 digits and avoid collisions', () => {
  const date = new Date(2026, 10, 13);
  assert.match(generateTransactionId(date, () => false, always(0.1234)), /^AP2611131234$/);

  const taken = new Set(['AP2611130000']);
  const rolls = [0, 0.5];
  const id = generateTransactionId(date, (candidate) => taken.has(candidate), () => rolls.shift());
  assert.equal(id, 'AP2611135000');
});

test('processPayment builds a complete transaction record', async () => {
  const fixedNow = new Date('2026-11-13T07:00:00Z');
  const txn = await processPayment(base, { now: () => fixedNow, random: always(0.5), delayMs: 0 });
  assert.equal(txn.status, 'success');
  assert.equal(txn.createdAt, fixedNow.toISOString());
  assert.deepEqual(txn.refunds, []);
  assert.equal(txn.amount, 1000);
  assert.equal(txn.failureReason, null);
  assert.ok(!('accountLast4' in txn), 'helper field is not stored');
});
