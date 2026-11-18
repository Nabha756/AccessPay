// Checkout form validation.
//
// Each validator returns an error message string, or null if the value is
// fine. Messages say what to do, not just what's wrong, because they are
// read out by screen readers next to the field (WCAG 3.3.1 / 3.3.3).

// Per-transaction limits for the demo payment methods, in rupees.
// UPI's ₹1,00,000 matches the usual NPCI limit; the others are made up.
export const METHOD_LIMITS = {
  upi: 100000,
  card: 200000,
  netbanking: 500000,
};

export const MIN_AMOUNT_PAISE = 100; // ₹1
export const NOTE_MAX_LENGTH = 50;

const NAME_PATTERN = /^[\p{L}\p{M}\p{N} .,'&()-]+$/u;
// name@handle, e.g. meera.joshi@okdemo
const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{2,63}$/;
// 4 letters (bank), a zero, then 6 letters/digits (branch)
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function validateRecipientName(value) {
  const name = value.trim();
  if (name === '') return 'Enter the recipient’s name';
  if (name.length < 2 || name.length > 60) return 'Recipient name must be between 2 and 60 characters';
  if (!NAME_PATTERN.test(name)) return 'Recipient name can only use letters, numbers, spaces and . , ’ & - ( )';
  return null;
}

export function validateUpiId(value) {
  const upi = value.trim();
  if (upi === '') return 'Enter the recipient’s UPI ID';
  if (!UPI_PATTERN.test(upi)) return 'Enter a UPI ID in the format name@bank, like meera.joshi@okdemo';
  return null;
}

/** Removes spaces people often type when copying account numbers. */
export function normaliseAccountNumber(value) {
  return value.replace(/\s+/g, '');
}

export function validateAccountNumber(value) {
  const account = normaliseAccountNumber(value);
  if (account === '') return 'Enter the account number';
  if (!/^\d+$/.test(account)) return 'Account number can only contain digits';
  if (account.length < 9 || account.length > 18) return 'Account number must be between 9 and 18 digits';
  return null;
}

export function validateConfirmAccount(value, original) {
  const confirm = normaliseAccountNumber(value);
  if (confirm === '') return 'Enter the account number again';
  if (confirm !== normaliseAccountNumber(original)) return 'Account numbers do not match. Check both and try again';
  return null;
}

export function validateIfsc(value) {
  const ifsc = value.trim().toUpperCase();
  if (ifsc === '') return 'Enter the IFSC code';
  if (!IFSC_PATTERN.test(ifsc)) return 'Enter an 11-character IFSC code, like DEMO0001021';
  return null;
}

/**
 * Converts what the user typed ("1,250", "₹ 99.5") to paise.
 * Returns null if it isn't a valid money amount.
 */
export function parseAmountToPaise(value) {
  const cleaned = String(value).replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [rupees, fraction = ''] = cleaned.split('.');
  // Build paise from the digit strings rather than multiplying a float by 100,
  // which can give results like 1.15 * 100 = 114.99999999999999.
  return Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
}

export function validateAmount(value, method) {
  if (String(value).trim() === '') return 'Enter an amount';
  const paise = parseAmountToPaise(value);
  if (paise === null) return 'Enter an amount in rupees, like 1250 or 1250.50';
  if (paise < MIN_AMOUNT_PAISE) return 'Amount must be at least ₹1';
  const limit = METHOD_LIMITS[method];
  if (limit && paise > limit * 100) {
    return `Amount must be ₹${limit.toLocaleString('en-IN')} or less for this payment method`;
  }
  return null;
}

export function validateMethod(value) {
  if (!METHOD_LIMITS[value]) return 'Choose how you want to pay';
  return null;
}

export function validateNote(value) {
  if (value.trim().length > NOTE_MAX_LENGTH) return `Note must be ${NOTE_MAX_LENGTH} characters or fewer`;
  return null;
}

/**
 * Validates the whole checkout form.
 * `data` is a plain object of the raw input strings.
 * Returns { valid, errors: { fieldName: message }, payment } where `payment`
 * holds cleaned-up values ready to process (only meaningful when valid).
 */
export function validateCheckout(data) {
  const errors = {};
  const add = (field, message) => { if (message) errors[field] = message; };

  add('recipientName', validateRecipientName(data.recipientName ?? ''));

  if (data.payeeType === 'bank') {
    add('accountNumber', validateAccountNumber(data.accountNumber ?? ''));
    add('confirmAccount', validateConfirmAccount(data.confirmAccount ?? '', data.accountNumber ?? ''));
    add('ifsc', validateIfsc(data.ifsc ?? ''));
  } else {
    add('upiId', validateUpiId(data.upiId ?? ''));
  }

  add('method', validateMethod(data.method ?? ''));
  // Only check the limit once we know the method; otherwise just check the format.
  add('amount', validateAmount(data.amount ?? '', errors.method ? null : data.method));
  add('note', validateNote(data.note ?? ''));

  const valid = Object.keys(errors).length === 0;
  if (!valid) return { valid, errors, payment: null };

  const account = normaliseAccountNumber(data.accountNumber ?? '');
  return {
    valid,
    errors,
    payment: {
      recipientName: data.recipientName.trim(),
      payeeType: data.payeeType === 'bank' ? 'bank' : 'upi',
      // Only the last 4 digits of an account number are kept, like a bank statement.
      payeeId: data.payeeType === 'bank'
        ? `XXXXXX${account.slice(-4)} · ${data.ifsc.trim().toUpperCase()}`
        : data.upiId.trim().toLowerCase(),
      accountLast4: data.payeeType === 'bank' ? account.slice(-4) : null,
      amount: parseAmountToPaise(data.amount),
      method: data.method,
      note: (data.note ?? '').trim(),
    },
  };
}
