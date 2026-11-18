import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatINR, formatRelativeDateTime, plural } from '../../js/lib/format.js';

test('formatINR uses Indian digit grouping and two decimals', () => {
  assert.equal(formatINR(125000), '₹1,250.00');
  assert.equal(formatINR(1234567890), '₹1,23,45,678.90');
  assert.equal(formatINR(0), '₹0.00');
  assert.equal(formatINR(5), '₹0.05');
});

test('formatRelativeDateTime says Today / Yesterday for recent dates', () => {
  const now = new Date(2026, 10, 13, 15, 0).getTime();
  assert.match(formatRelativeDateTime(new Date(2026, 10, 13, 9, 5).toISOString(), now), /^Today, 9:05\s?am$/i);
  assert.match(formatRelativeDateTime(new Date(2026, 10, 12, 21, 0).toISOString(), now), /^Yesterday, /);
  assert.match(formatRelativeDateTime(new Date(2026, 10, 2, 10, 0).toISOString(), now), /^2 Nov, /);
});

test('plural', () => {
  assert.equal(plural(1, 'payment'), '1 payment');
  assert.equal(plural(3, 'payment'), '3 payments');
});
