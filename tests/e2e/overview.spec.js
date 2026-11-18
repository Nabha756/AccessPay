import { test, expect } from '@playwright/test';

test('overview shows status counts and recent activity from sample data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  const kpis = page.getByRole('region', { name: 'Payment counts' });
  await expect(kpis.getByRole('link', { name: /view failed payments/ })).toContainText('3');

  const recent = page.getByRole('region', { name: 'Recent activity' });
  await expect(recent.getByRole('listitem')).toHaveCount(6);
});

test('KPI cells link to the filtered transaction list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /view pending payments/ }).click();
  await expect(page).toHaveURL(/#\/transactions\?status=pending$/);
});

test('empty history shows an empty state with a call to action', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('accesspay.transactions.v1', '[]'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No payments yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Make your first payment' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent activity' })).toHaveCount(0);
});

test('corrupt saved data shows an alert instead of a blank page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('accesspay.transactions.v1', '{broken'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('could not be read');
});

test('recipient names are escaped, not rendered as HTML', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('accesspay.transactions.v1', JSON.stringify([{
      id: 'APXSS', recipientName: '<img src=x onerror="window.__xss=1">', payeeType: 'upi',
      payeeId: 'x@okdemo', amount: 100, method: 'upi', note: '', status: 'success',
      createdAt: new Date().toISOString(), failureReason: null, refunds: [],
    }]));
  });
  await page.goto('/');
  await expect(page.getByText('<img src=x onerror="window.__xss=1">')).toBeVisible();
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});
