// Phase 0 smoke: the app loads, seeds the demo, and every tab renders.

import { activeScenarioName, expect, headerMetric, loadApp, test, wipeDb } from './fixtures';

const TABS: Array<[label: string, landmark: RegExp]> = [
  ['Plan', /^Household$/],
  ['Projection', /^Year by year$/],
  ['Monte Carlo', /^Simulation settings$/],
  ['Backtest', /^Historical (backtest|success rate)$/],
  ['Scenarios', /^Side by side$/],
  ['Timeline', /^Life timeline$/],
  ['Cash Flow', /^Cash flow by year$/],
];

test('first run seeds the demo household and shows headline metrics', async ({ freshApp: page }) => {
  await expect(page).toHaveTitle(/FirePath/);
  for (const label of ['Net worth today', 'FI number', 'Projected FI', 'Success']) {
    await expect(page.getByRole('banner').getByText(label)).toBeVisible();
  }
  await expect(page.locator('select[aria-label="Active scenario"] option')).toHaveText(['Demo Plan']);
  // Real dollar figures, not placeholders — and Monte Carlo completes in the header.
  await expect(headerMetric(page, 'Net worth today')).toHaveText(/^\$/);
  await expect(headerMetric(page, 'Success')).toHaveText(/^[\d.]+%$/, { timeout: 20_000 });
});

test('all seven tabs render their view', async ({ seedApp: page }) => {
  for (const [label, landmark] of TABS) {
    await page.locator('nav').getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByText(landmark).first()).toBeVisible();
  }
});

test('a blank scenario can be created from the Backup menu', async ({ blankApp: page }) => {
  await expect(activeScenarioName(page)).toHaveText('New Scenario');
  await expect(page.locator('select[aria-label="Active scenario"] option')).toHaveCount(2);
});

test('loading the app produces no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    // Recharts 2.x triggers React 18.3's defaultProps deprecation warning; not ours.
    if (msg.type() === 'error' && !msg.text().includes('defaultProps')) errors.push(msg.text());
  });
  await wipeDb(page);
  await loadApp(page);
  await expect(headerMetric(page, 'Success')).toHaveText(/^[\d.]+%$/, { timeout: 20_000 });
  expect(errors).toEqual([]);
});
