// Phase 3 acceptance: the three success numbers explain themselves, the FI line has a
// visible series to cross, timeline bands follow flows, savings rate surfaces
// (UX_AUDIT F7 F8 F9 F23).

import { expect, headerMetric, test } from './fixtures';

test('the three success numbers sit side by side with their sources', async ({ seedApp: page }) => {
  await expect(headerMetric(page, 'Success')).toHaveText(/^[\d.]+%$/, { timeout: 20_000 });
  const headerValue = (await headerMetric(page, 'Success').textContent())!;

  await page.locator('nav').getByRole('button', { name: 'Monte Carlo', exact: true }).click();
  const card = page.locator('section').filter({ hasText: 'About these numbers' });
  for (const method of ['Monte Carlo — normal', 'Monte Carlo — bootstrap', 'Historical backtest']) {
    await expect(card.getByRole('row').filter({ hasText: method }).locator('td').last())
      .toHaveText(/^[\d.]+%$/, { timeout: 20_000 });
  }
  // The header's number is the active (normal-mode) row's number.
  await expect(card.getByRole('row').filter({ hasText: 'Monte Carlo — normal' }).locator('td').last())
    .toHaveText(headerValue);
  await expect(card.getByRole('row').filter({ hasText: 'Monte Carlo — normal' })).toContainText('in header');
});

test('the header names which model its success number comes from', async ({ seedApp: page }) => {
  const banner = page.getByRole('banner');
  await expect(banner.getByText(/Success · normal MC/)).toBeVisible();
  await page.locator('nav').getByRole('button', { name: 'Monte Carlo', exact: true }).click();
  await page.getByRole('button', { name: 'Block bootstrap' }).click();
  await expect(banner.getByText(/Success · bootstrap MC/)).toBeVisible();
});

test('the projection chart draws the invested boundary the FI line compares against', async ({ seedApp: page }) => {
  await page.locator('nav').getByRole('button', { name: 'Projection', exact: true }).click();
  await expect(page.getByText('Invested (excl. cash)').first()).toBeVisible(); // legend entry
  await expect(page.getByText(/the FI line compares against the dashed invested series/)).toBeVisible();
});

test('timeline bands derive from actual flows, not the retirement-age input', async ({ seedApp: page }) => {
  // Demo retires at 55 but net-draws-down from the age-50 downshift.
  await page.locator('nav').getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText('Drawing down (from 50)')).toBeVisible();
  await expect(page.getByText('Saving', { exact: true })).toBeVisible();
});

test('the plan rail shows a savings rate for year one', async ({ seedApp: page }) => {
  const rail = page.locator('section').filter({ hasText: 'Live projection' });
  await expect(rail.getByText('Savings rate (yr 1)').locator('xpath=following-sibling::dd'))
    .toHaveText(/^\d+%$/);
});

test('the savings rate dashes when there is no income', async ({ blankApp: page }) => {
  const rail = page.locator('section').filter({ hasText: 'Live projection' });
  await expect(rail.getByText('Savings rate (yr 1)').locator('xpath=following-sibling::dd'))
    .toHaveText('—');
});
