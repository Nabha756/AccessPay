// Writes an amount in words the way Indian cheques do:
//   125000000 paise -> "Rupees twelve lakh fifty thousand only"
//
// Shown under the amount field and on the review screen. Reading the amount
// back in words makes an extra or missing zero obvious, which helps everyone
// but especially people using screen magnifiers or with dyscalculia.

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Words for 0–99. */
function twoDigits(n) {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens}-${ones}` : tens;
}

/** Words for 0–999. */
function threeDigits(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' and ');
}

/**
 * Whole number to words using the Indian system
 * (thousand, lakh = 1,00,000, crore = 1,00,00,000).
 */
export function numberToIndianWords(n) {
  if (n === 0) return 'zero';

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  const parts = [];
  // Anything above 99 crore is written as "<words> crore" recursively.
  if (crore) parts.push(`${numberToIndianWords(crore)} crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

export function amountToWords(paise) {
  if (!Number.isInteger(paise) || paise < 0) return '';
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;

  if (rupees === 0 && remainder === 0) return 'Rupees zero only';
  if (rupees === 0) return `${capitalise(twoDigits(remainder))} paise only`;

  let words = `Rupees ${numberToIndianWords(rupees)}`;
  if (remainder) words += ` and ${twoDigits(remainder)} paise`;
  return `${words} only`;
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
