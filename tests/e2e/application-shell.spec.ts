import { expect, test } from '@playwright/test';

test('filters the demo period using Colombo dates and preserves it across routes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-30T19:00:00Z'));
  await page.goto('/');
  await expect(page.getByText('Demonstration data')).toBeVisible();
  await expect(page.getByText('Rs. 1,840,000.00')).toBeVisible();
  await page.getByRole('button', { name: 'December 2026' }).press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Reporting period' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Month').selectOption('2026-11');
  await dialog.getByRole('button', { name: 'Apply period' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL('/?period=2026-11');
  await expect(page.getByText('Rs. 1,620,000.00')).toBeVisible();

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL('/reports?period=2026-11');
  await expect(page.getByRole('table', { name: 'Fleet operating statement' })).toContainText('November 2026');
  await page.reload();
  await expect(page.getByRole('button', { name: 'November 2026' })).toBeVisible();
});

test('supports keyboard navigation and keeps mobile tables within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');

  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Navigation' });
  await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.press('Enter');
  await dialog.getByRole('link', { name: 'Trip sheets' }).press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Trip sheets' })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  const search = page.getByRole('searchbox', { name: 'Search trip sheets' });
  await search.fill('Galle');
  await expect(page.getByRole('table', { name: 'Trip sheets' }).getByRole('row')).toHaveCount(2);
  await search.fill('unknown reference');
  await expect(page.getByText('No records match your search')).toBeVisible();
});

test('applies saved themes before React and follows live system changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'light');

  const theme = page.getByRole('combobox', { name: 'Appearance', exact: true });
  await theme.selectOption('dark');
  await expect(root).toHaveAttribute('data-theme', 'dark');

  await page.route('**/src/main.tsx', (route) => route.abort());
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.unroute('**/src/main.tsx');
  await page.reload();
  await expect(theme).toHaveValue('dark');

  await theme.selectOption('system');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('combobox', { name: 'Quick appearance' }).selectOption('light');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(theme).toHaveValue('light');
});
