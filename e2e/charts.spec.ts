// Phase 7 acceptance: charts answer the follow-up questions — when does it fail, what
// are the exact numbers, what happened that year — and the dice are honest
// (UX_AUDIT F10 F20 F21 F22 F26 F29).

import type { Page } from '@playwright/test';
import { expect, reloadApp, test } from './fixtures';

const openTab = (page: Page, label: string) =>
  page.locator('nav').getByRole('button', { name: label, exact: true }).click();

const balanceField = (page: Page, account: string) =>
  page.getByText(account, { exact: true }).locator('xpath=following-sibling::label[1]//input');

test('the failure strip says when runs fail, and matches the gauge', async ({ seedApp: page }) => {
  await openTab(page, 'Monte Carlo');
  const gauge = page.locator('section').filter({ hasText: 'Chance of success' });
  await expect(gauge.getByText(/^[\d.]+%$/)).toBeVisible({ timeout: 30_000 });

  // The demo succeeds ~74% of the time, so the strip must be present and specific.
  await expect(page.getByText(/If it fails, when/)).toBeVisible();
  await expect(page.getByText(/of runs run out\s*of money; peak failure age \d+/)).toBeVisible();
});

test('a plan that never fails shows no failure strip', async ({ blankApp: page }) => {
  // $5M against $10k/yr of spending: success is 100% by a mile.
  await page
    .locator('section')
    .filter({ hasText: 'Quick levers' })
    .getByRole('textbox', { name: 'Spending in retirement' })
    .fill('10000');
  await balanceField(page, 'Taxable brokerage').fill('5000000');

  await openTab(page, 'Monte Carlo');
  const gauge = page.locator('section').filter({ hasText: 'Chance of success' });
  await expect(gauge.getByText('100%', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/If it fails, when/)).toHaveCount(0);
});

test('fan chart, histogram, and backtest all toggle to real tables', async ({ seedApp: page }) => {
  test.setTimeout(60_000);
  await openTab(page, 'Monte Carlo');
  const fan = page.locator('section').filter({ hasText: 'Net worth percentile bands' });
  await expect(fan.locator('.recharts-responsive-container').first()).toBeVisible({ timeout: 30_000 });

  // Fan → table: one row per age, starting at the demo's current age.
  await fan.getByRole('button', { name: 'Table' }).click();
  await expect(fan.getByRole('columnheader', { name: 'Median' })).toBeVisible();
  await expect(fan.getByRole('row').nth(1)).toContainText('35');

  // Histogram → table: bin ranges whose counts sum to exactly the number of trials.
  const hist = page.locator('section').filter({ hasText: 'Distribution of ending net worth' });
  await hist.getByRole('button', { name: 'Table' }).click();
  await expect(hist.getByRole('columnheader', { name: 'Ending net worth' })).toBeVisible();
  const counts = await hist.locator('tbody td:nth-child(2)').allTextContents();
  expect(counts.reduce((s, t) => s + Number(t), 0)).toBe(5_000); // MC_DEFAULT_RUNS — every trial lands in a bin
  await expect(hist.getByText(/–/).first()).toBeVisible(); // bins labeled as ranges (F21)

  // Backtest → table: every start year, beginning with 1871.
  await openTab(page, 'Backtest');
  const bt = page.locator('section').filter({ hasText: 'Ending net worth by historical start year' });
  await expect(bt.locator('.recharts-responsive-container')).toBeVisible({ timeout: 30_000 });
  await bt.getByRole('button', { name: 'Table' }).click();
  await expect(bt.getByRole('row').nth(1)).toContainText('1871');
  await expect(bt.getByRole('row').nth(1)).toContainText(/Survives|Fails at age \d+/);
});

test('long Sankey labels truncate with an ellipsis but keep their full name', async ({ seedApp: page }) => {
  const incomeCard = page.locator('section').filter({ hasText: 'Income streams' });
  await incomeCard.getByRole('textbox', { name: 'Name' }).first().fill('Extremely long income stream name');

  await openTab(page, 'Cash Flow');
  await expect(page.getByText('Extremely long in…')).toBeVisible();
  await expect(page.locator('svg title').filter({ hasText: 'Extremely long income stream name' })).toHaveCount(1);
});

test('a projection row cross-links to that year of cash flow', async ({ seedApp: page }) => {
  await openTab(page, 'Projection');
  await page.getByRole('button', { name: 'View cash flow at age 53' }).click();
  await expect(page.getByText(/^Cash flow by year$/)).toBeVisible();
  await expect(page.getByText(/Age 53 · \d{4}/)).toBeVisible();
});

test('a timeline milestone cross-links to that year of cash flow', async ({ seedApp: page }) => {
  await openTab(page, 'Timeline');
  // The demo's "Kid starts college" milestone sits at age 53.
  await page.getByRole('button', { name: 'View cash flow at age 53' }).click();
  await expect(page.getByText(/Age 53 · \d{4}/)).toBeVisible();
});

test('the dice re-roll is session-only', async ({ seedApp: page }) => {
  test.setTimeout(60_000);
  await openTab(page, 'Monte Carlo');
  const gauge = page.locator('section').filter({ hasText: 'Chance of success' });
  await expect(gauge.getByText(/^[\d.]+%$/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: '🎲 New draw' }).click();
  await expect(page.getByText(/draw #2 · session-only/)).toBeVisible();
  // The re-rolled run completes (stale dims, then the marker clears — P4 machinery).
  await expect(page.getByRole('banner').locator('p[data-computing]')).not.toBeVisible({ timeout: 30_000 });

  // Reload restores the fixed default draw for reproducibility.
  await reloadApp(page);
  await openTab(page, 'Monte Carlo');
  await expect(page.getByText(/draw #/)).toHaveCount(0);
});
