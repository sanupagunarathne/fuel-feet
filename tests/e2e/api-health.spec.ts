import { expect, test } from '@playwright/test';

test('shows the real API connection state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'API connection' })).toHaveText('Connected');
});

test('retries a failed health check on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/health', (route) => route.fulfill({ status: 503 }));
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'API connection' })).toHaveText('Connection unavailable');

  await page.unroute('**/api/health');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('status', { name: 'API connection' })).toHaveText('Connected');
});
