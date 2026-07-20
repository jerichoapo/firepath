// Cloud sync UI (D31) — the signed-out surface only. Every Supabase request is
// blocked at the network layer: these tests prove the panel works (and the app
// stays fully usable) with zero cloud connectivity.

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/supabase\.(co|com)/, (route) => route.abort());
});

test('cloud button opens the account panel; app works without any network', async ({ page }) => {
  await page.goto('/');
  const btn = page.getByTestId('cloud-btn');
  await expect(btn).toBeVisible();

  await btn.click();
  const dialog = page.getByRole('dialog', { name: 'Cloud sync account' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Email')).toBeVisible();
  await expect(dialog.getByLabel('Password')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Create account' })).toBeVisible();

  // Signed out, the status dot reports signedOut and the app itself is untouched.
  await expect(page.getByTestId('cloud-dot')).toHaveAttribute('data-phase', 'signedOut');

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('FI number').first()).toBeVisible();
});

test('sign-in failure surfaces an error instead of hanging (network down)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('cloud-btn').click();
  const dialog = page.getByRole('dialog', { name: 'Cloud sync account' });
  await dialog.getByLabel('Email').fill('nobody@example.com');
  await dialog.getByLabel('Password').fill('password123');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  // supabase-js turns the aborted request into an error message; the panel shows it.
  await expect(dialog.getByText(/⚠/)).toBeVisible({ timeout: 15_000 });
});
