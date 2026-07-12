// Phase 1 acceptance: incomplete plans never claim success, invalid inputs are
// clamped or flagged, and the demo labels itself (UX_AUDIT F1 F2 F3 F5).

import { activeScenarioName, expect, headerMetric, reloadApp, test, waitForFlag } from './fixtures';

/** The balance input on an Accounts row (first field after the account label). */
const balanceField = (page: import('@playwright/test').Page, account: string) =>
  page.getByText(account, { exact: true }).locator('xpath=following-sibling::label[1]//input');

test('a blank plan shows the incomplete state until spending exists', async ({ blankApp: page }) => {
  const banner = page.getByRole('banner');
  for (const label of ['FI number', 'Projected FI', 'Success']) {
    await expect(headerMetric(page, label)).toHaveText('—');
  }
  await expect(banner.getByRole('button', { name: /Finish setup/ })).toBeVisible();
  await expect(banner.getByText(/coast/i)).toHaveCount(0);

  await page.getByRole('textbox', { name: /Current annual spending/ }).fill('40000');

  await expect(headerMetric(page, 'FI number')).toHaveText('$1.0M');
  await expect(headerMetric(page, 'Success')).toHaveText(/^[\d.]+%$/, { timeout: 20_000 });
  await expect(banner.getByRole('button', { name: /Finish setup/ })).toHaveCount(0);
  await expect(banner.getByText(/coast/i)).toBeVisible();
});

test('the Finish setup chip deep-links back to the Plan tab', async ({ blankApp: page }) => {
  await page.locator('nav').getByRole('button', { name: 'Projection', exact: true }).click();
  await expect(page.getByText('Year by year')).toBeVisible();
  await page.getByRole('banner').getByRole('button', { name: /Finish setup/ }).click();
  await expect(page.getByText('Household', { exact: true })).toBeVisible();
});

test('life expectancy clamps to stay above current age', async ({ blankApp: page }) => {
  const le = page.getByRole('textbox', { name: /Life expectancy/ });
  await le.fill('25'); // blank plan's current age is 30
  await le.blur();
  await expect(le).toHaveValue('31');
});

test('negative balances are rejected on commit', async ({ blankApp: page }) => {
  const taxable = balanceField(page, 'Taxable brokerage');
  await taxable.fill('-50000');
  await expect(page.getByText(/balance is negative/)).toBeVisible();
  await taxable.blur();
  await expect(taxable).toHaveValue('0');
  await expect(page.getByText(/balance is negative/)).toHaveCount(0);
});

test('income streams that end before they start are flagged', async ({ blankApp: page }) => {
  const incomeCard = page.locator('section').filter({ hasText: 'Income streams' });
  await incomeCard.getByRole('button', { name: '+ Add' }).click();
  await incomeCard.getByRole('textbox', { name: /^To/ }).fill('20'); // stream starts at 30
  await expect(page.getByText(/ends at 20, before it starts at 30/)).toBeVisible();
});

test('demo banner names the demo and its dismissal persists', async ({ freshApp: page }) => {
  await expect(page.getByText(/demo household/)).toBeVisible();
  await expect(page.locator('select[aria-label="Active scenario"] option')).toHaveText(['Demo Plan']);

  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByText(/demo household/)).toHaveCount(0);

  await waitForFlag(page, 'demoBannerDismissed');
  await reloadApp(page);
  await expect(page.getByText(/demo household/)).toHaveCount(0);
});

test('Start blank from the banner yields an incomplete blank plan', async ({ freshApp: page }) => {
  await page.getByRole('button', { name: 'Start blank' }).click();

  await expect(page.getByText(/demo household/)).toHaveCount(0);
  await expect(activeScenarioName(page)).toHaveText('Blank Plan');
  await expect(headerMetric(page, 'FI number')).toHaveText('—');
  await expect(page.getByRole('banner').getByRole('button', { name: /Finish setup/ })).toBeVisible();

  await waitForFlag(page, 'demoBannerDismissed');
  await reloadApp(page);
  await expect(activeScenarioName(page)).toHaveText('Blank Plan');
  await expect(page.getByText(/demo household/)).toHaveCount(0);
});

test('orientation card dismisses and stays dismissed', async ({ freshApp: page }) => {
  await expect(page.getByText('How FirePath works')).toBeVisible();
  await page.getByRole('button', { name: '✕ Got it' }).click();
  await expect(page.getByText('How FirePath works')).toHaveCount(0);

  await waitForFlag(page, 'orientationDismissed');
  await reloadApp(page);
  await expect(page.getByText('How FirePath works')).toHaveCount(0);
});
