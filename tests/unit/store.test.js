import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, TRANSACTIONS_KEY } from '../../js/store.js';
import { createMemoryStorage, createBrokenStorage, makeTxn } from './helpers.js';

test('first visit seeds sample data and saves it', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage });
  assert.ok(store.getAll().length > 0);
  assert.equal(JSON.parse(storage.getItem(TRANSACTIONS_KEY)).length, store.getAll().length);
  assert.equal(store.loadError, null);
});

test('an empty saved list stays empty (user cleared their history)', () => {
  const storage = createMemoryStorage({ [TRANSACTIONS_KEY]: '[]' });
  const store = createStore({ storage });
  assert.deepEqual(store.getAll(), []);
});

test('added transactions persist across store instances', () => {
  const storage = createMemoryStorage({ [TRANSACTIONS_KEY]: '[]' });
  createStore({ storage }).add(makeTxn({ id: 'AP1' }));
  const reloaded = createStore({ storage });
  assert.equal(reloaded.getById('AP1').recipientName, 'Test Recipient');
});

test('update replaces the matching transaction and reports missing ids', () => {
  const storage = createMemoryStorage({ [TRANSACTIONS_KEY]: JSON.stringify([makeTxn({ id: 'AP1' })]) });
  const store = createStore({ storage });
  assert.equal(store.update({ ...store.getById('AP1'), status: 'refunded' }), true);
  assert.equal(createStore({ storage }).getById('AP1').status, 'refunded');
  assert.equal(store.update(makeTxn({ id: 'NOPE' })), false);
});

test('getAll returns a copy so sorting it does not reorder the store', () => {
  const storage = createMemoryStorage({
    [TRANSACTIONS_KEY]: JSON.stringify([makeTxn({ id: 'A' }), makeTxn({ id: 'B' })]),
  });
  const store = createStore({ storage });
  store.getAll().reverse();
  assert.deepEqual(store.getAll().map((t) => t.id), ['A', 'B']);
});

test('corrupt saved data is reported instead of crashing', () => {
  const storage = createMemoryStorage({ [TRANSACTIONS_KEY]: '{not json' });
  const store = createStore({ storage });
  assert.deepEqual(store.getAll(), []);
  assert.match(store.loadError, /could not be read/);

  store.restoreSampleData();
  assert.equal(store.loadError, null);
  assert.ok(store.getAll().length > 0);
});

test('blocked storage falls back to sample data in memory', () => {
  const store = createStore({ storage: createBrokenStorage() });
  assert.ok(store.getAll().length > 0);
  assert.match(store.loadError, /blocking local storage/);
  assert.equal(store.add(makeTxn({ id: 'X' })), false, 'add reports that saving failed');
});

test('clearAll empties history and persists the empty list', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage });
  store.clearAll();
  assert.deepEqual(createStore({ storage }).getAll(), []);
});
