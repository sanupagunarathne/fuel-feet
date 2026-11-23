import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, '')) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('Invalid authenticator setup key');
    bits += value.toString(2).padStart(5, '0');
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('managed auth gates a deep link, enrolls TOTP, and signs out', async ({ page }) => {
  const email = process.env.FUEL_FEET_AUTH_E2E_EMAIL;
  const password = process.env.FUEL_FEET_AUTH_E2E_PASSWORD;
  if (!email || !password) throw new Error('Configure a fresh, provisioned test administrator');

  const readiness = await page.request.get('/api/ready');
  expect(readiness.status()).toBe(200);
  expect(await readiness.json()).toEqual({ status: 'ok' });
  expect((await page.request.get('/api/me')).status()).toBe(401);

  await page.goto('/trips?period=2026-10');
  await expect(page).toHaveURL('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/mfa');
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  const setupKey = page.locator('.auth-form code');
  await expect(setupKey).toBeVisible();
  const secret = await setupKey.innerText();
  await page.getByLabel('Verification code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page).toHaveURL('/trips?period=2026-10');
  await expect(page.getByRole('heading', { level: 1, name: 'Trip sheets' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Trip sheets' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/login');
  await page.goto('/reports');
  await expect(page).toHaveURL('/login');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/mfa');
  await expect(page.getByLabel('Verification code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up authenticator' })).toHaveCount(0);
  await page.getByLabel('Verification code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page).toHaveURL('/reports');
});

test('operational workflow creates a trip, reconciles profit and exports the report', async ({ page }) => {
  const email = process.env.FUEL_FEET_WORKFLOW_EMAIL;
  const password = process.env.FUEL_FEET_WORKFLOW_PASSWORD;
  test.skip(!email || !password, 'Provision a second fresh administrator for the operational workflow');
  if (!email || !password) return;
  test.setTimeout(60_000);
  await page.goto('/vehicles?period=2026-10');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  const setupKey = page.locator('.auth-form code');
  await expect(setupKey).toBeVisible();
  const secret = await setupKey.innerText();
  await page.getByLabel('Verification code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page).toHaveURL('/vehicles?period=2026-10');

  const suffix = Date.now().toString().slice(-8);
  const registration = `TEST ${suffix}`;
  const reference = `BROWSER-${suffix}`;
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Registration number').fill(registration);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();

  await nav.getByRole('link', { name: 'Employees' }).click();
  for (const [role, rate] of [['Driver', '10'], ['Conductor', '5']] as const) {
    await page.getByRole('button', { name: 'Add employee' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Full name').fill(`${role} ${suffix}`);
    await dialog.getByLabel('Crew role').selectOption({ label: role });
    await dialog.getByLabel('Salary rate (%)').fill(rate);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  await nav.getByRole('link', { name: 'Vehicles' }).click();
  const vehicle = page.getByRole('row').filter({ hasText: registration });
  await vehicle.getByRole('button', { name: 'Crew', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Effective date').fill('2026-10-01');
  await dialog.getByLabel('Regular driver').selectOption({ label: `Driver ${suffix}` });
  await dialog.getByLabel('Regular conductor').selectOption({ label: `Conductor ${suffix}` });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('link', { name: 'Quick add trip' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Trip-sheet reference').fill(reference);
  await dialog.getByLabel('Trip date').fill('2026-10-31');
  await dialog.getByRole('combobox', { name: 'Vehicle', exact: true }).selectOption({ label: registration });
  await expect(dialog.getByLabel('Actual driver').locator('option:checked')).toHaveText(`Driver ${suffix}`);
  await expect(dialog.getByLabel('Actual conductor').locator('option:checked')).toHaveText(`Conductor ${suffix}`);
  await dialog.getByLabel('Revenue (LKR)').fill('50000.00');
  await dialog.getByRole('button', { name: 'Save draft' }).click();
  await expect(dialog).toBeHidden();
  const trip = page.getByRole('row').filter({ hasText: reference });
  await trip.getByRole('button', { name: 'Confirm', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Confirm trip' });
  await dialog.getByRole('button', { name: 'Review earnings' }).click();
  await expect(dialog).toContainText('Rs. 5,000.00');
  await expect(dialog).toContainText('Rs. 2,500.00');
  await dialog.getByRole('button', { name: 'Confirm trip' }).click();
  await expect(dialog).toBeHidden();
  await expect(trip).toContainText('Confirmed');

  await nav.getByRole('link', { name: 'Expenses' }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Vehicle', exact: true }).selectOption({ label: registration });
  await dialog.getByLabel('Expense date').fill('2026-10-31');
  await dialog.getByLabel('Category').selectOption({ label: 'Highway bills' });
  await dialog.getByLabel('Amount (LKR)').fill('1000.00');
  await dialog.getByLabel('Related trip').selectOption({ label: reference });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();

  await nav.getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('combobox', { name: 'Vehicle', exact: true }).selectOption({ label: registration });
  await expect(page.getByRole('table', { name: 'Vehicle profitability' })).toContainText('Rs. 41,500.00');
  await page.getByRole('link', { name: 'View operating statement' }).click();
  await expect(page.getByRole('table', { name: 'Fleet operating statement' })).toContainText('Rs. 41,500.00');

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel', exact: true }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);

  if (process.env.SUPABASE_STORAGE_KEY) {
    await nav.getByRole('link', { name: 'Trip sheets' }).click();
    await page.getByRole('row').filter({ hasText: reference }).getByRole('button', { name: 'Documents' }).click();
    dialog = page.getByRole('dialog');
    const pdfPath = await pdf.path();
    if (!pdfPath) throw new Error('Missing temporary PDF');
    await dialog.getByLabel('PDF, JPEG or PNG').setInputFiles({ name: 'test-report.pdf', mimeType: 'application/pdf', buffer: await readFile(pdfPath) });
    await dialog.getByRole('button', { name: 'Upload document' }).click();
    await expect(dialog).toContainText('Document uploaded.');
    const [document] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download', exact: true }).click()]);
    expect(document.suggestedFilename()).toBe('test-report.pdf');
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
  }

  await nav.getByRole('link', { name: 'Salaries' }).click();
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Employee', exact: true }).selectOption({ label: `Driver ${suffix}` });
  await dialog.getByLabel('Payment date').fill('2026-11-05');
  await dialog.getByLabel('Payment amount (LKR)').fill('1000');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  const salaryRow = page.getByRole('table', { name: 'Employee balances' }).getByRole('row').filter({ hasText: `Driver ${suffix}` });
  await expect(salaryRow).toContainText('Rs. 4,000.00');
  await expect(salaryRow).toContainText('Partial');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
