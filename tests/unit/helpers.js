// Shared test helpers.

/** In-memory stand-in for window.localStorage. */
export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
}

/** Storage that throws on every call, like Safari with storage disabled. */
export function createBrokenStorage() {
  const fail = () => { throw new Error('SecurityError: storage disabled'); };
  return { getItem: fail, setItem: fail, removeItem: fail, clear: fail };
}

/** Builds a transaction with sensible defaults; override what the test cares about. */
export function makeTxn(overrides = {}) {
  return {
    id: 'AP2611010001',
    recipientName: 'Test Recipient',
    payeeType: 'upi',
    payeeId: 'test@okdemo',
    amount: 100000,
    method: 'upi',
    note: '',
    status: 'success',
    createdAt: '2026-11-01T10:00:00.000Z',
    failureReason: null,
    refunds: [],
    ...overrides,
  };
}
