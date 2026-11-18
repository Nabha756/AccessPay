// Sample transactions shown on first visit so the app isn't empty.
// Dates are relative to "now" so the demo always looks current.
// All names, UPI IDs and account numbers are made up.

const DAY = 24 * 60 * 60 * 1000;

// [daysAgo, hour, minute, recipientName, payeeType, payeeId, rupees, method, status, note, extra]
const ROWS = [
  [0, 13, 42, 'Meera Joshi', 'upi', 'meera.joshi@okdemo', 1250, 'upi', 'success', 'Dinner split, Vaishali'],
  [0, 9, 5, 'Sahyadri Broadband', 'upi', 'sahyadribroadband@demopay', 799, 'netbanking', 'pending', 'November plan'],
  [1, 19, 20, 'Deccan Travels', 'upi', 'deccantravels@demopay', 2650, 'netbanking', 'pending', 'Bus to Kolhapur'],
  [1, 10, 15, 'Rohan Patil', 'bank', 'XXXXXX4417 · DEMO0001021', 15000, 'netbanking', 'success', 'Room rent share'],
  [2, 8, 30, 'Pune Metro Smart Card', 'upi', 'punemetro@demopay', 500, 'upi', 'success', 'Card recharge'],
  [3, 11, 0, 'Kothrud Housing Society', 'bank', 'XXXXXX7712 · DEMO0002210', 3200, 'netbanking', 'success', 'Maintenance, November'],
  [4, 21, 10, 'Aditya Kulkarni', 'upi', 'aditya.k@okdemo', 640, 'upi', 'failed', 'Movie tickets',
    { failureReason: 'The recipient’s bank did not respond in time. No money was debited.' }],
  [5, 18, 45, 'Shree Ganesh Stores', 'upi', 'shreeganeshstores@demopay', 389, 'upi', 'success', 'Groceries'],
  [7, 16, 5, 'City Power Distribution', 'upi', 'citypower.bills@demopay', 1840, 'card', 'success', 'Electricity bill, October'],
  [9, 12, 30, 'Sneha Deshmukh', 'upi', 'sneha.deshmukh@okdemo', 2000, 'upi', 'refunded', 'Rajgad trek booking',
    { refunds: [{ rupees: 2000, reason: 'Trek cancelled due to rain', daysAgo: 8 }] }],
  [10, 7, 50, 'FitRepublic Gym', 'upi', 'fitrepublic@demopay', 1499, 'card', 'success', 'Monthly membership'],
  [12, 17, 25, 'Book World, Deccan', 'upi', 'bookworld.deccan@demopay', 865, 'card', 'success', 'Two textbooks',
    { refunds: [{ rupees: 300, reason: 'Returned one book', daysAgo: 10 }] }],
  [14, 22, 5, 'Kunal Shah', 'upi', 'kunal.shah@okdemo', 300, 'upi', 'failed', 'Cricket ground booking',
    { failureReason: 'Incorrect UPI PIN entered. No money was debited.' }],
  [15, 10, 40, 'University Exam Cell', 'bank', 'XXXXXX0098 · DEMO0000456', 1200, 'netbanking', 'success', 'Semester exam fee'],
  [18, 20, 15, 'Priya Iyer', 'upi', 'priya.iyer@okdemo', 450, 'upi', 'success', 'Chai and snacks'],
  [21, 9, 0, 'Annapurna Tiffin Service', 'upi', 'annapurnatiffin@demopay', 2400, 'upi', 'success', 'Monthly tiffin'],
  [25, 15, 30, 'Ishaan Bhosale', 'bank', 'XXXXXX3390 · DEMO0001021', 5000, 'netbanking', 'success', 'Laptop repair share'],
  [28, 9, 10, 'Sahyadri Broadband', 'upi', 'sahyadribroadband@demopay', 799, 'netbanking', 'success', 'October plan'],
  [33, 11, 5, 'Kothrud Housing Society', 'bank', 'XXXXXX7712 · DEMO0002210', 3200, 'netbanking', 'success', 'Maintenance, October'],
  [36, 20, 40, 'Meera Joshi', 'upi', 'meera.joshi@okdemo', 780, 'upi', 'success', 'Birthday gift share'],
  [40, 13, 20, 'Deccan Travels', 'upi', 'deccantravels@demopay', 1350, 'card', 'failed', 'Bus to Nashik',
    { failureReason: 'The card issuer declined this payment. No money was debited.' }],
  [45, 10, 0, 'Rohan Patil', 'bank', 'XXXXXX4417 · DEMO0001021', 15000, 'netbanking', 'success', 'Room rent share'],
  [52, 8, 35, 'Pune Metro Smart Card', 'upi', 'punemetro@demopay', 500, 'upi', 'success', 'Card recharge'],
  [58, 16, 50, 'City Power Distribution', 'upi', 'citypower.bills@demopay', 1720, 'card', 'success', 'Electricity bill, September'],
];

function atDaysAgo(now, daysAgo, hour, minute) {
  const d = new Date(now - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  // Keep "today" entries from landing in the future when the demo is opened early in the morning.
  if (d.getTime() > now) d.setTime(now - 5 * 60 * 1000);
  return d;
}

function seedId(date, index) {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `AP${yy}${mm}${dd}${String(4100 + index * 37).slice(-4)}`;
}

export function createSeedTransactions(now = Date.now()) {
  return ROWS.map((row, index) => {
    const [daysAgo, hour, minute, recipientName, payeeType, payeeId, rupees, method, status, note, extra = {}] = row;
    const created = atDaysAgo(now, daysAgo, hour, minute);

    const refunds = (extra.refunds ?? []).map((r) => ({
      amount: r.rupees * 100,
      reason: r.reason,
      createdAt: atDaysAgo(now, r.daysAgo, hour + 1, minute).toISOString(),
    }));

    return {
      id: seedId(created, index),
      recipientName,
      payeeType,
      payeeId,
      amount: rupees * 100,
      method,
      note,
      status,
      createdAt: created.toISOString(),
      failureReason: extra.failureReason ?? null,
      refunds,
    };
  });
}
