import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');

// Runs axe-core against the WCAG 2.0/2.1/2.2 A and AA rules and returns
// a readable summary of any violations.
async function axeViolations(page) {
  await page.addScriptTag({ path: AXE_PATH });
  const results = await page.evaluate(() => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  }));
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

async function payUntil(page, step) {
  await page.goto('/#/pay');
  await page.getByLabel('Recipient name').fill('Meera Joshi');
  await page.getByRole('textbox', { name: 'UPI ID' }).fill('meera.joshi@okdemo');
  await page.getByLabel('Amount in rupees').fill('1250');
  await page.getByRole('group', { name: 'Pay from' }).getByRole('radio', { name: /^UPI/ }).check();
  await page.getByRole('button', { name: 'Review payment' }).click();
  if (step === 'review') return;
  await page.getByRole('button', { name: /^Pay / }).click();
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();
}

const SCREENS = {
  overview: async (page) => page.goto('/'),
  'checkout form': async (page) => page.goto('/#/pay'),
  'checkout errors': async (page) => {
    await page.goto('/#/pay');
    await page.getByRole('button', { name: 'Review payment' }).click();
  },
  'checkout review': async (page) => payUntil(page, 'review'),
  'checkout result': async (page) => payUntil(page, 'result'),
  transactions: async (page) => page.goto('/#/transactions'),
  'no matching transactions': async (page) => page.goto('/#/transactions?q=zzzz'),
  'transaction details with refund form': async (page) => {
    await page.goto('/#/transactions?q=Book');
    await page.getByRole('link', { name: 'Book World, Deccan' }).click();
    await page.getByRole('button', { name: 'Refund payment' }).click();
    await page.getByRole('button', { name: 'Confirm refund' }).click(); // shows the reason error
  },
  'display & data': async (page) => page.goto('/#/settings'),
};

for (const contrast of ['standard', 'high']) {
  test.describe(`axe WCAG 2.2 AA scan, ${contrast} contrast`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((c) => {
        Math.random = () => 0.5;
        localStorage.setItem('accesspay.settings', JSON.stringify({ contrast: c }));
      }, contrast);
    });

    for (const [name, open] of Object.entries(SCREENS)) {
      test(name, async ({ page }) => {
        await open(page);
        expect(await axeViolations(page)).toEqual([]);
      });
    }
  });
}

test.describe('display settings', () => {
  test('high contrast applies immediately and survives a reload', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: /High contrast/ }).check();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await expect(page.locator('#live-polite')).toHaveText('High contrast on.');

    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(255, 255, 255)');
  });

  test('text size scales the root font size', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: /Largest/ }).check();
    const size = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(size).toBe('24px');
  });

  test('reduce motion turns off the result animation', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('accesspay.settings', JSON.stringify({ motion: 'reduce' })));
    await page.addInitScript(() => { Math.random = () => 0.5; });
    await payUntil(page, 'result');
    const duration = await page.locator('.result__icon').evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(duration)).toBeLessThan(0.001);
  });

  test('the operating system reduced-motion preference is respected too', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => { Math.random = () => 0.5; });
    await payUntil(page, 'result');
    const duration = await page.locator('.result__icon').evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(duration)).toBeLessThan(0.001);
  });

  test('deleting all data asks first, then shows empty states; restore brings it back', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Delete all transactions' }).click();
    const confirm = page.getByRole('group', { name: /Delete 24 transactions/ });
    await expect(confirm).toBeFocused();

    await page.getByRole('button', { name: 'Keep my transactions' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('button', { name: 'Delete all transactions' })).toBeFocused();

    await page.getByRole('button', { name: 'Delete all transactions' }).click();
    await page.getByRole('button', { name: 'Yes, delete all' }).click();
    await expect(page.getByRole('status')).toContainText('Deleted 24 transactions.');

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'No payments yet' })).toBeVisible();

    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Restore sample data' }).click();
    await expect(page.getByRole('status')).toContainText('24 transactions');
  });

  test('deleting transactions keeps display settings', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: /High contrast/ }).check();
    await page.getByRole('button', { name: 'Delete all transactions' }).click();
    await page.getByRole('button', { name: 'Yes, delete all' }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  });
});

test.describe('keyboard and focus', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard checks run on desktop');

  test('focus indicator is clearly visible on links and buttons', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // wordmark
    await page.keyboard.press('Tab'); // Overview nav link
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).toBe('solid');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('every page can be reached from the navigation by keyboard', async ({ page }) => {
    await page.goto('/');
    for (const name of ['Make a payment', 'Transactions', 'Display & data', 'Overview']) {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    }
  });

  test('transaction list: filters and rows are reachable in a logical order', async ({ page }) => {
    await page.goto('/#/transactions');
    await page.getByLabel('Search by recipient or transaction ID').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Status')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Sort by')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('.txn-table a').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/transactions\/AP/);
  });
});

test.describe('responsive layout', () => {
  const pages = ['/', '/#/pay', '/#/transactions', '/#/transactions?status=failed', '/#/settings'];

  for (const scale of ['1', '1.5']) {
    test(`no sideways scrolling at ${Number(scale) * 100}% text`, async ({ page }) => {
      await page.addInitScript((s) => localStorage.setItem('accesspay.settings', JSON.stringify({ fontScale: s })), scale);
      for (const url of pages) {
        await page.goto(url);
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, `${url} overflows`).toBeLessThanOrEqual(clientWidth);
      }
    });
  }

  test('content reflows at 320px wide (WCAG 1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const url of pages) {
      await page.goto(url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${url} overflows at 320px`).toBeLessThanOrEqual(0);
    }
  });
});
