import { test, expect } from '@playwright/test';

test('skip link is the first tab stop and jumps to main content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('main navigation marks the current page and moves focus to the heading', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: 'Transactions' }).click();
  await expect(page).toHaveTitle(/Transactions · AccessPay/);
  await expect(nav.getByRole('link', { name: 'Transactions' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('unknown address shows a not-found page with a way back', async ({ page }) => {
  await page.goto('/#/does-not-exist');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await expect(page.getByRole('link', { name: 'Go to the overview' })).toBeVisible();
});
