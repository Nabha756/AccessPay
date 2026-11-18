import { test, expect } from '@playwright/test';

const rows = (page) => page.locator('.txn-table tbody tr');
const count = (page) => page.locator('.results__count');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.1; });
});

test('lists all sample transactions newest first', async ({ page }) => {
  await page.goto('/#/transactions');
  await expect(count(page)).toHaveText('Showing all 24 transactions.');
  await expect(rows(page)).toHaveCount(24);
  await expect(page.getByRole('columnheader', { name: 'Date' })).toHaveAttribute('aria-sort', 'descending');
});

test('search by recipient name and by transaction ID', async ({ page }) => {
  await page.goto('/#/transactions');
  const search = page.getByLabel('Search by recipient or transaction ID');

  await search.fill('rohan');
  await expect(rows(page)).toHaveCount(2);
  await expect(count(page)).toHaveText('Showing 2 of 24 transactions.');
  await expect(page.locator('#live-polite')).toHaveText('Showing 2 of 24 transactions.');
  await expect(page).toHaveURL(/q=rohan/);

  const id = await page.locator('.txn-table .txn-id').first().textContent();
  await search.fill(id.toLowerCase());
  await expect(rows(page)).toHaveCount(1);
});

test('filter by status and keep it after reload', async ({ page }) => {
  await page.goto('/#/transactions');
  await page.getByLabel('Status').selectOption('failed');
  await expect(rows(page)).toHaveCount(3);
  for (const badge of await page.locator('.txn-table .status').all()) {
    await expect(badge).toHaveText('Failed');
  }
  await page.reload();
  await expect(page.getByLabel('Status')).toHaveValue('failed');
  await expect(rows(page)).toHaveCount(3);
});

test('sort by amount, high to low', async ({ page }) => {
  await page.goto('/#/transactions');
  await page.getByLabel('Sort by').selectOption('amount-desc');
  await expect(page.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'descending');

  const amounts = await page.locator('.txn-table .cell-amount > div').allTextContents();
  const values = amounts.map((a) => Number(a.trim().split('\n')[0].replace(/[₹,\s]/g, '')));
  expect(values).toEqual([...values].sort((a, b) => b - a));
  expect(values[0]).toBe(15000);
});

test('no matches shows a helpful empty state that can clear filters', async ({ page }) => {
  await page.goto('/#/transactions?q=zzzz&status=failed');
  await expect(page.getByRole('heading', { name: 'No transactions found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows(page)).toHaveCount(24);
  await expect(page.getByLabel('Search by recipient or transaction ID')).toBeFocused();
});

test('empty history has its own empty state and no filters', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('accesspay.transactions.v1', '[]'));
  await page.goto('/#/transactions');
  await expect(page.getByRole('heading', { name: 'No transactions yet' })).toBeVisible();
  await expect(page.getByRole('search')).toHaveCount(0);
});

test('opening a transaction shows its details', async ({ page }) => {
  await page.goto('/#/transactions?status=failed');
  await page.getByRole('link', { name: 'Aditya Kulkarni' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Payment to Aditya Kulkarni');
  await expect(page.getByText('did not respond in time')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refund payment' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Try this payment again' })).toBeVisible();
});

test('try again pre-fills checkout from a failed UPI payment', async ({ page }) => {
  await page.goto('/#/transactions?q=Aditya');
  await page.getByRole('link', { name: 'Aditya Kulkarni' }).click();
  await page.getByRole('link', { name: 'Try this payment again' }).click();
  await expect(page.getByLabel('Recipient name')).toHaveValue('Aditya Kulkarni');
  await expect(page.getByRole('textbox', { name: 'UPI ID' })).toHaveValue('aditya.k@okdemo');
});

test('partial then full refund, saved across reloads', async ({ page }) => {
  await page.goto('/#/transactions?q=Book%20World');
  await page.getByRole('link', { name: 'Book World, Deccan' }).click();

  const toggle = page.getByRole('button', { name: 'Refund payment' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Refund amount in rupees')).toBeFocused();
  await expect(page.getByLabel('Refund amount in rupees')).toHaveValue('565.00');

  await page.getByLabel('Refund amount in rupees').fill('100');
  await page.getByLabel('Reason').selectOption('Item returned');
  await page.getByRole('button', { name: 'Confirm refund' }).click();
  await expect(page.getByRole('status')).toContainText('Refund of ₹100.00 processed. ₹465.00 can still be refunded.');

  await page.reload();
  await expect(page.getByText('Successful, ₹400.00 refunded')).toBeVisible();

  await page.getByRole('button', { name: 'Refund payment' }).click();
  await page.getByLabel('Reason').selectOption('Item returned');
  await page.getByRole('button', { name: 'Confirm refund' }).click();
  await expect(page.getByRole('status')).toContainText('now fully refunded');
  await expect(page.locator('.details__amount .status')).toHaveText('Refunded');
  await expect(page.getByRole('button', { name: 'Refund payment' })).toHaveCount(0);
});

test('refund form validates amount and reason', async ({ page }) => {
  await page.goto('/#/transactions?q=Meera');
  await page.getByRole('link', { name: 'Meera Joshi' }).first().click();
  await page.getByRole('button', { name: 'Refund payment' }).click();

  await page.getByLabel('Refund amount in rupees').fill('99999');
  await page.getByRole('button', { name: 'Confirm refund' }).click();
  await expect(page.getByLabel('Refund amount in rupees')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Refund amount in rupees')).toHaveAccessibleDescription(/can’t be more than ₹1,250.00/);
  await expect(page.locator('#refund-reason-error')).toContainText('Choose a reason');

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Refund payment' })).toBeFocused();
  await expect(page.locator('#refund-form')).toBeHidden();
});

test('old payments explain that the refund window has closed', async ({ page }) => {
  await page.goto('/#/transactions?q=Rohan&sort=date-asc');
  await page.getByRole('link', { name: 'Rohan Patil' }).first().click(); // 45 days old
  await expect(page.getByText('Refunds are only available for 30 days')).toBeVisible();
});

test('checking a pending payment updates its status', async ({ page }) => {
  await page.goto('/#/transactions?status=pending');
  await page.getByRole('link', { name: 'Deccan Travels' }).click();
  await page.getByRole('button', { name: 'Check payment status' }).click();
  await expect(page.getByRole('status')).toContainText('It is now successful');
  await expect(page.locator('#flash')).toBeFocused();
  await expect(page.locator('.details__amount .status')).toHaveText('Successful');
});

test('unknown transaction ID shows a not-found message', async ({ page }) => {
  await page.goto('/#/transactions/AP0000000000');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Transaction not found');
});

test('a new payment appears at the top of the history', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await page.goto('/#/pay');
  await page.getByLabel('Recipient name').fill('Nisha Rao');
  await page.getByRole('textbox', { name: 'UPI ID' }).fill('nisha.rao@okdemo');
  await page.getByLabel('Amount in rupees').fill('321');
  await page.getByRole('group', { name: 'Pay from' }).getByRole('radio', { name: /^UPI/ }).check();
  await page.getByRole('button', { name: 'Review payment' }).click();
  await page.getByRole('button', { name: /^Pay / }).click();
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Transactions' }).click();
  await expect(rows(page).first()).toContainText('Nisha Rao');
  await expect(count(page)).toHaveText('Showing all 25 transactions.');
});
