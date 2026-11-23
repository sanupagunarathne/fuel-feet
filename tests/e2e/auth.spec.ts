import { createHmac } from 'node:crypto';
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
