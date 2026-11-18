import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRecipientName, validateUpiId, validateAccountNumber, validateConfirmAccount,
  validateIfsc, parseAmountToPaise, validateAmount, validateNote, validateCheckout,
} from '../../js/lib/validation.js';

test('recipient name: required, length and allowed characters', () => {
  assert.match(validateRecipientName('   '), /Enter the recipient/);
  assert.match(validateRecipientName('A'), /between 2 and 60/);
  assert.match(validateRecipientName('x'.repeat(61)), /between 2 and 60/);
  assert.match(validateRecipientName('Meera <script>'), /can only use/);
  assert.equal(validateRecipientName('Meera Joshi'), null);
  assert.equal(validateRecipientName("D'Souza & Sons (Pune)"), null);
  assert.equal(validateRecipientName('मीरा जोशी'), null, 'Devanagari names are valid');
});

test('UPI ID format', () => {
  assert.equal(validateUpiId('meera.joshi@okdemo'), null);
  assert.equal(validateUpiId('9876543210@upi'), null);
  assert.match(validateUpiId(''), /Enter the recipient/);
  assert.match(validateUpiId('meera.joshi'), /format name@bank/);
  assert.match(validateUpiId('meera@'), /format name@bank/);
  assert.match(validateUpiId('meera@ok demo'), /format name@bank/);
  assert.match(validateUpiId('@okdemo'), /format name@bank/);
});

test('account number: digits only, 9 to 18 long, spaces ignored', () => {
  assert.equal(validateAccountNumber('1234 5678 9012'), null);
  assert.match(validateAccountNumber('12345678'), /between 9 and 18/);
  assert.match(validateAccountNumber('1'.repeat(19)), /between 9 and 18/);
  assert.match(validateAccountNumber('12345abc90'), /only contain digits/);
  assert.match(validateAccountNumber(''), /Enter the account number/);
});

test('confirm account number must match', () => {
  assert.equal(validateConfirmAccount('123456789012', '1234 5678 9012'), null);
  assert.match(validateConfirmAccount('123456789013', '123456789012'), /do not match/);
  assert.match(validateConfirmAccount('', '123456789012'), /again/);
});

test('IFSC: 4 letters, 0, 6 letters or digits; lower case accepted', () => {
  assert.equal(validateIfsc('DEMO0001021'), null);
  assert.equal(validateIfsc('demo0001021'), null);
  assert.match(validateIfsc('DEMO1001021'), /11-character/);
  assert.match(validateIfsc('DEM0001021'), /11-character/);
  assert.match(validateIfsc(''), /Enter the IFSC/);
});

test('parseAmountToPaise handles commas, rupee symbol and decimals exactly', () => {
  assert.equal(parseAmountToPaise('1250'), 125000);
  assert.equal(parseAmountToPaise('1,250.5'), 125050);
  assert.equal(parseAmountToPaise('₹ 99.99'), 9999);
  assert.equal(parseAmountToPaise('1.15'), 115, 'no floating point error');
  assert.equal(parseAmountToPaise('0.1'), 10);
  assert.equal(parseAmountToPaise('12.345'), null, 'max two decimals');
  assert.equal(parseAmountToPaise('-50'), null);
  assert.equal(parseAmountToPaise('1e5'), null);
  assert.equal(parseAmountToPaise('abc'), null);
  assert.equal(parseAmountToPaise(''), null);
});

test('amount limits depend on the payment method', () => {
  assert.match(validateAmount('', 'upi'), /Enter an amount/);
  assert.match(validateAmount('0.50', 'upi'), /at least ₹1/);
  assert.match(validateAmount('0', 'upi'), /at least ₹1/);
  assert.equal(validateAmount('100000', 'upi'), null, 'exactly the limit is allowed');
  assert.match(validateAmount('100000.01', 'upi'), /₹1,00,000 or less/);
  assert.equal(validateAmount('150000', 'card'), null);
  assert.match(validateAmount('500001', 'netbanking'), /₹5,00,000 or less/);
  assert.match(validateAmount('12..5', 'upi'), /in rupees/);
});

test('note is optional but limited to 50 characters', () => {
  assert.equal(validateNote(''), null);
  assert.equal(validateNote('x'.repeat(50)), null);
  assert.match(validateNote('x'.repeat(51)), /50 characters or fewer/);
});

test('validateCheckout: valid UPI payment is cleaned up', () => {
  const result = validateCheckout({
    recipientName: '  Meera Joshi ', payeeType: 'upi', upiId: ' Meera.Joshi@OKDEMO ',
    amount: '1,250', method: 'upi', note: ' Dinner ',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.payment, {
    recipientName: 'Meera Joshi',
    payeeType: 'upi',
    payeeId: 'meera.joshi@okdemo',
    accountLast4: null,
    amount: 125000,
    method: 'upi',
    note: 'Dinner',
  });
});

test('validateCheckout: bank payment only keeps the last 4 digits', () => {
  const result = validateCheckout({
    recipientName: 'Rohan Patil', payeeType: 'bank', accountNumber: '5010 0012 3445 17',
    confirmAccount: '50100012344517', ifsc: 'demo0001021', amount: '15000', method: 'netbanking', note: '',
  });
  assert.equal(result.valid, true);
  assert.equal(result.payment.payeeId, 'XXXXXX4517 · DEMO0001021');
  assert.equal(result.payment.accountLast4, '4517');
  assert.ok(!JSON.stringify(result.payment).includes('50100012344517'), 'full number is not kept');
});

test('validateCheckout: reports every problem at once', () => {
  const result = validateCheckout({ payeeType: 'upi', recipientName: '', upiId: 'bad', amount: '', method: '' });
  assert.equal(result.valid, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['amount', 'method', 'recipientName', 'upiId']);
});

test('validateCheckout: UPI fields are ignored when paying a bank account (and vice versa)', () => {
  const result = validateCheckout({
    recipientName: 'Rohan', payeeType: 'bank', upiId: 'not-checked', accountNumber: '',
    confirmAccount: '', ifsc: '', amount: '10', method: 'upi',
  });
  assert.ok(!('upiId' in result.errors));
  assert.ok('accountNumber' in result.errors);
});
