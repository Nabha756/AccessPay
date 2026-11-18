// Simulated payment gateway. NOTHING here talks to a real bank.
//
// Outcomes are mostly random so the demo feels real, but a few recipient
// IDs always give the same result so success, failure and pending can be
// shown on demand (and tested):
//
//   fail@okdemo      -> always fails
//   pending@okdemo   -> always pending
//   bank account ending in 0000 -> always fails
//
// `random` and `delayMs` are parameters so unit tests can make the outcome
// deterministic and skip the artificial wait.

export const DEMO_TRIGGERS = {
  fail: 'fail@okdemo',
  pending: 'pending@okdemo',
};

const FAILURE_REASONS = {
  upi: [
    'The recipient’s bank did not respond in time. No money was debited.',
    'Your bank’s UPI server is busy. No money was debited.',
  ],
  card: [
    'The card issuer declined this payment. No money was debited.',
    'Card verification timed out. No money was debited.',
  ],
  netbanking: [
    'The bank session expired before the payment was authorised. No money was debited.',
  ],
};

// Rough odds for random outcomes. Net banking is more often "pending"
// because real net banking confirmations can lag behind.
const ODDS = {
  upi: { fail: 0.08, pending: 0.03 },
  card: { fail: 0.1, pending: 0.02 },
  netbanking: { fail: 0.06, pending: 0.12 },
};

function pick(list, random) {
  return list[Math.floor(random() * list.length) % list.length];
}

/** Decides the outcome of a payment request. Pure apart from `random`. */
export function decideOutcome(payment, random = Math.random) {
  if (payment.payeeId === DEMO_TRIGGERS.fail || payment.accountLast4 === '0000') {
    return { status: 'failed', failureReason: pick(FAILURE_REASONS[payment.method] ?? FAILURE_REASONS.upi, random) };
  }
  if (payment.payeeId === DEMO_TRIGGERS.pending) {
    return { status: 'pending', failureReason: null };
  }

  const odds = ODDS[payment.method] ?? ODDS.upi;
  const roll = random();
  if (roll < odds.fail) {
    return { status: 'failed', failureReason: pick(FAILURE_REASONS[payment.method], random) };
  }
  if (roll < odds.fail + odds.pending) {
    return { status: 'pending', failureReason: null };
  }
  return { status: 'success', failureReason: null };
}

/**
 * Creates a transaction id like AP2611131234: "AP", the date (yymmdd) and
 * four random digits. Retries if the id is already used.
 */
export function generateTransactionId(date, isTaken = () => false, random = Math.random) {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  for (let attempt = 0; attempt < 50; attempt++) {
    const digits = String(Math.floor(random() * 10000)).padStart(4, '0');
    const id = `AP${yy}${mm}${dd}${digits}`;
    if (!isTaken(id)) return id;
  }
  // 50 collisions in one day is very unlikely; fall back to a longer suffix.
  return `AP${yy}${mm}${dd}${Date.now().toString().slice(-6)}`;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * "Sends" a payment and resolves with the new transaction record.
 * The delay imitates network/bank processing time.
 */
export async function processPayment(payment, {
  now = () => new Date(),
  isTaken,
  random = Math.random,
  delayMs = 1200,
} = {}) {
  if (delayMs > 0) await wait(delayMs);

  const createdAt = now();
  const outcome = decideOutcome(payment, random);

  return {
    id: generateTransactionId(createdAt, isTaken, random),
    recipientName: payment.recipientName,
    payeeType: payment.payeeType,
    payeeId: payment.payeeId,
    amount: payment.amount,
    method: payment.method,
    note: payment.note,
    status: outcome.status,
    createdAt: createdAt.toISOString(),
    failureReason: outcome.failureReason,
    refunds: [],
  };
}

/**
 * Simulates asking the bank about a pending payment. Most resolve to
 * success; some fail. Returns a NEW transaction object.
 */
export async function checkPendingStatus(txn, { random = Math.random, delayMs = 800 } = {}) {
  if (txn.status !== 'pending') return txn;
  if (delayMs > 0) await wait(delayMs);

  // The "pending" demo ID never resolves, so the pending state can always be shown.
  if (txn.payeeId === DEMO_TRIGGERS.pending) return txn;

  if (random() < 0.8) return { ...txn, status: 'success' };
  return {
    ...txn,
    status: 'failed',
    failureReason: 'The bank reversed this payment before it completed. No money was debited.',
  };
}
