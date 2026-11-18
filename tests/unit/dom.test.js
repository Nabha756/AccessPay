import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../../js/lib/dom.js';

test('escapeHtml neutralises markup in user input', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
  );
});

test('escapeHtml handles quotes, ampersands and empty values', () => {
  assert.equal(escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});
