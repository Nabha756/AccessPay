// Transaction storage backed by localStorage.
//
// The rest of the app never touches localStorage directly; it goes through
// this module. That keeps the storage key / JSON handling in one place and
// lets the unit tests pass in a fake storage object instead of a browser.

import { createSeedTransactions } from './data/seed.js';

export const TRANSACTIONS_KEY = 'accesspay.transactions.v1';

export function createStore({ storage = globalThis.localStorage, now = () => Date.now() } = {}) {
  let transactions = [];
  // Set when saved data couldn't be read, so the UI can tell the user
  // instead of silently showing an empty history.
  let loadError = null;

  function persist() {
    try {
      storage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
      return true;
    } catch (err) {
      // Quota exceeded or storage disabled (e.g. some private browsing modes).
      console.error('AccessPay: could not save transactions', err);
      return false;
    }
  }

  function load() {
    loadError = null;
    let raw = null;
    try {
      raw = storage.getItem(TRANSACTIONS_KEY);
    } catch (err) {
      loadError = 'Your browser is blocking local storage, so changes won’t be kept after you close this tab.';
      transactions = createSeedTransactions(now());
      return;
    }

    // First visit: nothing saved yet, so start with the sample data.
    if (raw === null) {
      transactions = createSeedTransactions(now());
      persist();
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Saved data is not a list');
      transactions = parsed;
    } catch (err) {
      loadError = 'Saved transactions could not be read and were not loaded. You can restore the sample data from Display & data.';
      transactions = [];
    }
  }

  load();

  return {
    get loadError() { return loadError; },

    /** Returns a copy so callers can sort/filter without mutating the store. */
    getAll() {
      return transactions.slice();
    },

    getById(id) {
      return transactions.find((t) => t.id === id) ?? null;
    },

    hasId(id) {
      return transactions.some((t) => t.id === id);
    },

    add(transaction) {
      transactions.push(transaction);
      return persist();
    },

    /** Replaces a transaction with an updated copy. Returns false if not found. */
    update(updated) {
      const index = transactions.findIndex((t) => t.id === updated.id);
      if (index === -1) return false;
      transactions[index] = updated;
      return persist();
    },

    clearAll() {
      transactions = [];
      loadError = null;
      return persist();
    },

    restoreSampleData() {
      transactions = createSeedTransactions(now());
      loadError = null;
      return persist();
    },
  };
}
