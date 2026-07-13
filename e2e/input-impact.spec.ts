// Input efficacy, end-to-end (D29): one test per Plan-tab card drives the real inputs
// and asserts a specific readout moves — plus each card's negative assertion (fields
// that must NOT move money math). Engine-level causality for every field is enforced
// exhaustively by src/engine/sensitivity.test.ts; this spec proves the UI wiring:
// field → plan → recompute → readout. Fields whose effect is real but smaller than the
// $M-rounded readouts (cost basis, cash return, partner claim age) are covered by the
// unit harness only — asserting them here would test display rounding, not wiring.

import type { Page } from '@playwright/test';
import { expect, headerMetric, test } from './fixtures';

/** A live-rail stat value (Plan tab), located from its uppercase label. */
const rail = (page: Page, label: string) =>
  page.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd');

const goTo = (page: Page, tab: string) =>
  page.locator('nav').getByRole('button', { name: tab, exact: true }).click();

test('Household: every age input moves the projection; Solo removes partner effects', async ({ seedApp: page }) => {
  // Retirement age reprices the FI number (spending at 50 falls back to current spending).
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
  await page.getByLabel('Full retirement age', { exact: true }).fill('50');
  await expect(headerMetric(page, 'FI number')).toHaveText('$1.8M');
  await page.getByLabel('Full retirement age', { exact: true }).fill('55');
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');

  // Your age: fewer working years — end of plan drops.
  const eop = await rail(page, 'End of plan').textContent();
  await page.getByLabel('Your age', { exact: true }).fill('40');
  await expect(rail(page, 'End of plan')).not.toHaveText(eop!);
  await page.getByLabel('Your age', { exact: true }).fill('35');

  // Life expectancy: shorter horizon changes the final number.
  const eop2 = await rail(page, 'End of plan').textContent();
  await page.getByLabel('Life expectancy', { exact: true }).fill('70');
  await expect(rail(page, 'End of plan')).not.toHaveText(eop2!);
  await page.getByLabel('Life expectancy', { exact: true }).fill('92');

  // Solo mode: partner SS row disappears and its money leaves the plan.
  const eop3 = await rail(page, 'End of plan').textContent();
  await page.getByRole('button', { name: 'Solo', exact: true }).click();
  await expect(page.getByLabel('Social Security — partner ($/yr)')).toHaveCount(0);
  await expect(rail(page, 'End of plan')).not.toHaveText(eop3!);
});

test('Accounts: balances move net worth; pre-tax contributions move the savings rate', async ({ seedApp: page }) => {
  const nw = await rail(page, 'Net worth @ retire').textContent();
  await page.getByLabel('Taxable brokerage balance').fill('500000');
  await expect(rail(page, 'Net worth @ retire')).not.toHaveText(nw!);

  // Zeroing the 401(k) contribution raises taxes now — the savings rate reacts.
  // (Net worth barely moves: unplanned surplus sweeps to taxable anyway — D28.)
  const sr = await rail(page, 'Savings rate (yr 1)').textContent();
  await page.getByLabel('401(k) / Trad IRA contribution per year').fill('0');
  await expect(rail(page, 'Savings rate (yr 1)')).not.toHaveText(sr!);
});

test('Income: amount, type, end age, and Social Security all reach the numbers', async ({ seedApp: page }) => {
  const sr = await rail(page, 'Savings rate (yr 1)').textContent();
  await page.getByLabel('Annual', { exact: true }).first().fill('150000');
  await expect(rail(page, 'Savings rate (yr 1)')).not.toHaveText(sr!);

  // W-2 → 1099 swaps employee FICA for SE tax on the same gross — after-tax drops.
  const sr2 = await rail(page, 'Savings rate (yr 1)').textContent();
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Income streams' }) })
    .locator('select')
    .first()
    .selectOption('se');
  await expect(rail(page, 'Savings rate (yr 1)')).not.toHaveText(sr2!);

  // Ending the salary a decade early guts the accumulation years.
  const nw = await rail(page, 'Net worth @ retire').textContent();
  await page.getByLabel('To', { exact: true }).first().fill('40');
  await expect(rail(page, 'Net worth @ retire')).not.toHaveText(nw!);

  // Social Security is retirement income: the end of plan feels it.
  const eop = await rail(page, 'End of plan').textContent();
  await page.getByLabel('Social Security — you ($/yr)', { exact: true }).fill('60000');
  await expect(rail(page, 'End of plan')).not.toHaveText(eop!);
});

test('Spending: current spending moves the plan but NOT the FI number; the phase moves both', async ({ seedApp: page }) => {
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
  const sr = await rail(page, 'Savings rate (yr 1)').textContent();

  await page.getByLabel('Current annual spending', { exact: true }).fill('100000');
  await expect(rail(page, 'Savings rate (yr 1)')).not.toHaveText(sr!);
  // The FI number prices retirement spending — the age-55 phase governs it, not today's.
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');

  // The governing phase's amount IS the FI number's input.
  await page.getByLabel('Annual spend', { exact: true }).first().fill('100000');
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.5M');

  // A one-time expense dents the accumulation.
  const nw = await rail(page, 'Net worth @ retire').textContent();
  await page.getByLabel('Amount', { exact: true }).first().fill('300000');
  await expect(rail(page, 'Net worth @ retire')).not.toHaveText(nw!);
});

test('Assumptions: return compounds, FI multiplier reprices FI only, growth trips the funding footer', async ({ seedApp: page }) => {
  const nw = await rail(page, 'Net worth @ retire').textContent();
  await page.getByLabel('Expected real return', { exact: true }).fill('8');
  await expect(rail(page, 'Net worth @ retire')).not.toHaveText(nw!);

  // FI multiplier reprices the target without touching the simulated path.
  const eop = await rail(page, 'End of plan').textContent();
  await page.getByRole('textbox', { name: /FI multiplier/ }).fill('30');
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.4M');
  await expect(rail(page, 'End of plan')).toHaveText(eop!);

  // Contribution growth compounds planned amounts past income — the footer counts it.
  const footer = await page.getByTestId('funding-status').textContent();
  await page.getByLabel('Contribution growth', { exact: true }).fill('6');
  await expect(page.getByTestId('funding-status')).not.toHaveText(footer!);
});

test('Assumptions isolation: σ recomputes Monte Carlo but never the deterministic path; allocation moves the backtest only', async ({ seedApp: page }) => {
  test.setTimeout(90_000);
  // Capture the backtest verdict first (its own tab computes it).
  await goTo(page, 'Backtest');
  const btValue = page.locator('.text-5xl').filter({ hasText: '%' });
  await expect(btValue).toHaveText(/%/, { timeout: 30_000 });
  const bt = await btValue.textContent();

  await goTo(page, 'Plan');
  const eop = await rail(page, 'End of plan').textContent();

  // σ: Monte Carlo goes stale-and-recomputing; the deterministic rail must not move.
  await page.getByLabel('Return volatility (σ)', { exact: true }).fill('30');
  await expect(page.locator('[data-computing]').first()).toBeVisible();
  await expect(rail(page, 'End of plan')).toHaveText(eop!);

  // Stock allocation: deterministic rail frozen, backtest verdict changes.
  await page.getByLabel('Stock allocation', { exact: true }).fill('20');
  await expect(rail(page, 'End of plan')).toHaveText(eop!);
  await goTo(page, 'Backtest');
  await expect(btValue).not.toHaveText(bt!, { timeout: 60_000 });
});

test('Taxes: filing status, state settings, and withdrawal order all change outcomes', async ({ seedApp: page }) => {
  const sr = await rail(page, 'Savings rate (yr 1)').textContent();
  await page.getByRole('button', { name: 'Single', exact: true }).click();
  await expect(rail(page, 'Savings rate (yr 1)')).not.toHaveText(sr!);

  const sr2 = await rail(page, 'Savings rate (yr 1)').textContent();
  await page.getByLabel('Flat rate', { exact: true }).fill('10');
  await expect(rail(page, 'Savings rate (yr 1)')).not.toHaveText(sr2!);

  const sr3 = await rail(page, 'Savings rate (yr 1)').textContent();
  await page.getByLabel('State standard deduction', { exact: true }).fill('100000');
  await expect(rail(page, 'Savings rate (yr 1)')).not.toHaveText(sr3!);

  const sr4 = await rail(page, 'Savings rate (yr 1)').textContent();
  await page.getByRole('button', { name: 'None', exact: true }).click();
  await expect(rail(page, 'Savings rate (yr 1)')).not.toHaveText(sr4!);

  // Withdrawal order decides which taxes retirement pays (early 401(k) = penalty years).
  const eop = await rail(page, 'End of plan').textContent();
  await page.getByRole('button', { name: 'Move Taxable brokerage later' }).click();
  await expect(rail(page, 'End of plan')).not.toHaveText(eop!);
});

test('Milestones: markers move on the timeline and nothing else moves', async ({ seedApp: page }) => {
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
  const eop = await rail(page, 'End of plan').textContent();

  await page.getByLabel('Downshift / part-time age', { exact: true }).fill('45');
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Your milestones' }) })
    .getByLabel('Age', { exact: true })
    .first()
    .fill('60');

  // Money math untouched…
  await expect(rail(page, 'End of plan')).toHaveText(eop!);
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');

  // …but the timeline markers moved.
  await goTo(page, 'Timeline');
  await expect(page.locator('[role="button"]').filter({ hasText: 'Downshift' }))
    .toHaveAttribute('aria-label', 'View cash flow at age 45');
  await expect(page.locator('[role="button"]').filter({ hasText: 'Kid starts college' }))
    .toHaveAttribute('aria-label', 'View cash flow at age 60');
});

test('Monte Carlo config: trials and return model recompute success; the deterministic verdict stands', async ({ seedApp: page }) => {
  test.setTimeout(90_000);
  await goTo(page, 'Monte Carlo');

  // Fewer trials: the version changes and the success chip cycles through computing.
  await page.getByLabel('Trials', { exact: true }).fill('2000');
  await expect(page.locator('[data-computing]').first()).toBeVisible();
  await expect(page.locator('[data-computing]')).toHaveCount(0, { timeout: 60_000 });
  const success = await headerMetric(page, 'Success').textContent();

  // Bootstrap draws history instead of N(μ, σ) — a genuinely different verdict.
  await page.getByRole('button', { name: 'Block bootstrap' }).click();
  await expect(page.locator('[data-computing]')).toHaveCount(0, { timeout: 60_000 });
  await expect(headerMetric(page, 'Success')).not.toHaveText(success!);

  // Monte Carlo settings never touch the deterministic FI number.
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
});
