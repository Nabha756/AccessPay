// Formatting helpers for money, dates and labels.
//
// Money is stored as an integer number of paise (₹1 = 100 paise) everywhere
// in the app. Floating point can't represent values like 0.1 exactly, so
// adding rupee amounts as decimals slowly drifts (0.1 + 0.2 !== 0.3).
// Integers avoid that; we only convert to rupees when displaying.

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(paise) {
  return inrFormatter.format(paise / 100);
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function formatDate(iso) {
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso) {
  return dateTimeFormatter.format(new Date(iso));
}

const timeFormatter = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
const dayMonthFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today, 1:42 pm", "Yesterday, 9:05 am" or "8 Nov, 4:50 pm" — used in short lists. */
export function formatRelativeDateTime(iso, now = Date.now()) {
  const date = new Date(iso);
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date.getTime())) / 86400000);
  let day;
  if (dayDiff === 0) day = 'Today';
  else if (dayDiff === 1) day = 'Yesterday';
  else day = dayMonthFormatter.format(date);
  return `${day}, ${timeFormatter.format(date)}`;
}

export const METHOD_LABELS = {
  upi: 'UPI',
  card: 'Debit card',
  netbanking: 'Net banking',
};

export const STATUS_LABELS = {
  success: 'Successful',
  pending: 'Pending',
  failed: 'Failed',
  refunded: 'Refunded',
};

export function methodLabel(method) {
  return METHOD_LABELS[method] ?? method;
}

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
