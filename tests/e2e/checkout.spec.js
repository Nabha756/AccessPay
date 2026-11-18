import { test, expect } from '@playwright/test';

// Pin Math.random so the simulated gateway is predictable:
// 0.5 is outside every failure/pending band, so payments succeed
// unless a demo trigger ID is used.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.5; });
});

const payFrom = (page) => page.getByRole('group', { name: 'Pay from' });

async function fillUpiPayment(page, { name = 'Meera Joshi', upi = 'meera.joshi@okdemo', amount = '1250', method = 'UPI' } = {}) {
  await page.getByLabel('Recipient name').fill(name);
  await page.getByRole('textbox', { name: 'UPI ID' }).fill(upi);
  await page.getByLabel('Amount in rupees').fill(amount);
  await payFrom(page).getByRole('radio', { name: new RegExp(`^${method}`) }).check();
}

test('successful UPI payment is shown and saved to history', async ({ page }) => {
  await page.goto('/#/pay');
  await fillUpiPayment(page);
  await expect(page.locator('#amount-words')).toHaveText('Rupees one thousand two hundred and fifty only');

  await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Review payment' })).toBeFocused();
  await page.getByRole('button', { name: 'Pay ₹1,250.00' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Payment successful' })).toBeFocused();
  const id = await page.locator('.txn-id').textContent();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('accesspay.transactions.v1')));
  const txn = saved.find((t) => t.id === id);
  expect(txn).toMatchObject({ status: 'success', amount: 125000, recipientName: 'Meera Joshi' });
});

test('failed payment explains why and offers to try again', async ({ page }) => {
  await page.goto('/#/pay');
  await fillUpiPayment(page, { name: 'Test Failure', upi: 'fail@okdemo', amount: '500' });
  await page.getByRole('button', { name: 'Review payment' }).click();
  await page.getByRole('button', { name: /^Pay / }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Payment failed' })).toBeVisible();
  await expect(page.getByText('No money was debited')).toBeVisible();

  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Review payment' })).toBeVisible();
});

test('pending payment says the bank has not confirmed yet', async ({ page }) => {
  await page.goto('/#/pay');
  await fillUpiPayment(page, { name: 'Slow Bank', upi: 'pending@okdemo', amount: '75' });
  await page.getByRole('button', { name: 'Review payment' }).click();
  await page.getByRole('button', { name: /^Pay / }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Payment pending' })).toBeVisible();
});

test('empty form shows a focused error summary linked to each field', async ({ page }) => {
  await page.goto('/#/pay');
  await page.getByRole('button', { name: 'Review payment' }).click();

  const summary = page.getByRole('region', { name: /Fix 4 problems/ });
  await expect(summary).toBeFocused();

  const nameInput = page.getByLabel('Recipient name');
  await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
  await expect(nameInput).toHaveAccessibleDescription(/Enter the recipient’s name/);

  await summary.getByRole('link', { name: 'Enter an amount' }).click();
  await expect(page.getByLabel('Amount in rupees')).toBeFocused();
  await expect(page).toHaveURL(/#\/pay$/); // link did not change the route
});

test('errors clear as the user fixes them', async ({ page }) => {
  await page.goto('/#/pay');
  await page.getByRole('button', { name: 'Review payment' }).click();
  const nameInput = page.getByLabel('Recipient name');
  await nameInput.fill('Meera Joshi');
  await nameInput.blur();
  await expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#recipient-name-error')).toBeEmpty();
});

test('amount above the UPI limit is rejected but allowed by net banking', async ({ page }) => {
  await page.goto('/#/pay');
  await fillUpiPayment(page, { amount: '150000' });
  await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.locator('#amount-error')).toContainText('₹1,00,000 or less');

  await payFrom(page).getByRole('radio', { name: /^Net banking/ }).check();
  await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Review payment' })).toBeVisible();
  await expect(page.getByText('Rupees one lakh fifty thousand only')).toBeVisible();
});

test('bank transfer validates matching account numbers and IFSC', async ({ page }) => {
  await page.goto('/#/pay');
  await page.getByLabel('Recipient name').fill('Rohan Patil');
  await page.getByRole('radio', { name: 'Bank account' }).check();
  await expect(page.getByRole('textbox', { name: 'UPI ID' })).toBeHidden();

  await page.getByLabel('Account number', { exact: true }).fill('501000123417');
  await page.getByLabel('Confirm account number').fill('501000123418');
  await page.getByLabel('IFSC code').fill('DEMO123');
  await page.getByLabel('Amount in rupees').fill('15000');
  await payFrom(page).getByRole('radio', { name: /^Net banking/ }).check();
  await page.getByRole('button', { name: 'Review payment' }).click();

  await expect(page.locator('#confirm-account-error')).toContainText('do not match');
  await expect(page.locator('#ifsc-error')).toContainText('11-character');

  await page.getByLabel('Confirm account number').fill('501000123417');
  await page.getByLabel('IFSC code').fill('DEMO0001021');
  await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.getByText('XXXXXX3417 · DEMO0001021')).toBeVisible();
});

test('edit details keeps what the user typed', async ({ page }) => {
  await page.goto('/#/pay');
  await fillUpiPayment(page, { amount: '999' });
  await page.getByRole('button', { name: 'Review payment' }).click();
  await page.getByRole('button', { name: 'Edit details' }).click();
  await expect(page.getByLabel('Recipient name')).toHaveValue('Meera Joshi');
  await expect(page.getByLabel('Amount in rupees')).toHaveValue('999');
  await expect(payFrom(page).getByRole('radio', { name: /^UPI/ })).toBeChecked();
});

test('the whole checkout can be completed with the keyboard only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is a desktop concern');
  await page.goto('/#/pay');
  await page.getByLabel('Recipient name').focus();
  await page.keyboard.type('Priya Iyer');
  await page.keyboard.press('Tab');          // Pay to: UPI ID radio (checked)
  await page.keyboard.press('Tab');          // UPI ID input
  await page.keyboard.type('priya.iyer@okdemo');
  await page.keyboard.press('Tab');          // amount
  await page.keyboard.type('450');
  await page.keyboard.press('Tab');          // first "Pay from" radio
  await page.keyboard.press('Space');        // select UPI
  await page.keyboard.press('Enter');        // submits the form
  await expect(page.getByRole('heading', { level: 1, name: 'Review payment' })).toBeFocused();

  // From the focused heading, Tab reaches the Pay button.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Pay ₹450.00' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Payment successful' })).toBeFocused();
});

test('pay button cannot be pressed twice while processing', async ({ page }) => {
  await page.goto('/#/pay');
  await fillUpiPayment(page);
  await page.getByRole('button', { name: 'Review payment' }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('accesspay.transactions.v1')).length);

  const pay = page.getByRole('button', { name: /^Pay / });
  await pay.click();
  await expect(page.getByRole('button', { name: 'Processing payment…' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Processing payment…' }).click({ force: true });

  await expect(page.getByRole('heading', { level: 1, name: 'Payment successful' })).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('accesspay.transactions.v1')).length);
  expect(after).toBe(before + 1);
});
