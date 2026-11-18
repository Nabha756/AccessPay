import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountToWords, numberToIndianWords } from '../../js/lib/amount-words.js';

test('small numbers', () => {
  assert.equal(numberToIndianWords(0), 'zero');
  assert.equal(numberToIndianWords(7), 'seven');
  assert.equal(numberToIndianWords(19), 'nineteen');
  assert.equal(numberToIndianWords(40), 'forty');
  assert.equal(numberToIndianWords(99), 'ninety-nine');
  assert.equal(numberToIndianWords(105), 'one hundred and five');
});

test('Indian grouping: thousand, lakh, crore', () => {
  assert.equal(numberToIndianWords(1250), 'one thousand two hundred and fifty');
  assert.equal(numberToIndianWords(100000), 'one lakh');
  assert.equal(numberToIndianWords(1250000), 'twelve lakh fifty thousand');
  assert.equal(numberToIndianWords(10000000), 'one crore');
  assert.equal(numberToIndianWords(123456789), 'twelve crore thirty-four lakh fifty-six thousand seven hundred and eighty-nine');
});

test('amountToWords works from paise and reads like a cheque', () => {
  assert.equal(amountToWords(125000), 'Rupees one thousand two hundred and fifty only');
  assert.equal(amountToWords(1250050), 'Rupees twelve thousand five hundred and fifty paise only');
  assert.equal(amountToWords(50), 'Fifty paise only');
  assert.equal(amountToWords(0), 'Rupees zero only');
  assert.equal(amountToWords(10000000), 'Rupees one lakh only');
});

test('amountToWords rejects invalid input', () => {
  assert.equal(amountToWords(-1), '');
  assert.equal(amountToWords(1.5), '');
});
