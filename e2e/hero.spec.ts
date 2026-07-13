// Phase 5 acceptance: the retire-at-X loop lives on the Plan tab with the verdict beside
// it, basis fields hide behind a disclosure that remembers, and every ⓘ caveat is
// reachable by keyboard (UX_AUDIT F6 F13 F28).

import { expect, headerMetric, test } from './fixtures';

test('the retirement-age lever re-prices FI live and mirrors into Household', async ({ seedApp: page }) => {
  const strip = page.locator('section').filter({ hasText: 'Quick levers' });
  // Demo: the age-55 phase spends $80k → FI = 80k × 25.
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
  await expect(strip.getByText(/Projected FI/)).toBeVisible();

  const slider = strip.getByRole('slider', { name: 'Retire at age slider' });
  await slider.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');

  // Retiring at 50 lands before the $80k phase: spending 72k → FI = 1.8M.
  await expect(strip.getByRole('textbox', { name: 'Retire at age' })).toHaveValue('50');
  await expect(headerMetric(page, 'FI number')).toHaveText('$1.8M');
  // Same field, both places.
  await expect(page.getByRole('textbox', { name: 'Full retirement age' })).toHaveValue('50');
});

test('the spending lever edits the phase the FI number is priced from', async ({ seedApp: page }) => {
  const strip = page.locator('section').filter({ hasText: 'Quick levers' });
  const spend = strip.getByRole('textbox', { name: 'Spending in retirement' });
  // The value in force at retirement age (the 55+ phase), not today's spending.
  await expect(spend).toHaveValue('80,000');

  await spend.fill('60000');
  await expect(headerMetric(page, 'FI number')).toHaveText('$1.5M');
  // The Spending card's phase row shows the same edited value. (exact: "Annual spend" is
  // a substring of "Current annual spending".)
  await expect(page.getByRole('textbox', { name: 'Annual spend', exact: true }).first()).toHaveValue('60,000');
});

test('a blank plan can be completed straight from the levers strip', async ({ blankApp: page }) => {
  await expect(headerMetric(page, 'FI number')).toHaveText('—');
  await page
    .locator('section')
    .filter({ hasText: 'Quick levers' })
    .getByRole('textbox', { name: 'Spending in retirement' })
    .fill('40000');
  // No phases yet, so the lever writes current spending — the plan is now complete.
  await expect(headerMetric(page, 'FI number')).toHaveText('$1.0M');
});

test('basis fields hide behind the Advanced disclosure, which remembers for the session', async ({ seedApp: page }) => {
  const basis = page.getByRole('textbox', { name: 'Taxable cost basis' });
  await expect(basis).not.toBeVisible();

  await page.getByText('Advanced: basis tracking').click();
  await expect(basis).toBeVisible();
  await expect(basis).toHaveValue('90,000');

  // Leave the tab and come back: still open within this session.
  await page.locator('nav').getByRole('button', { name: 'Projection', exact: true }).click();
  await page.locator('nav').getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Taxable cost basis' })).toBeVisible();
});

test('help popovers open by keyboard, read out, and close on Escape', async ({ seedApp: page }) => {
  const help = page.getByRole('button', { name: 'About Full retirement age' });
  await help.focus();
  await page.keyboard.press('Enter');

  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(/contributions stop/i);
  await expect(help).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(tip).not.toBeVisible();

  // Mouse path: click opens, outside click closes.
  await help.click();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.getByRole('heading', { name: 'Household' }).click();
  await expect(page.getByRole('tooltip')).not.toBeVisible();
});
