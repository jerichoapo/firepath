// Phase 6 acceptance: scenario identity is stable (stored colors), switches are
// announced with a way back, destructive actions are proportionate (popover vs
// type-to-confirm), and stress presets showcase compare (UX_AUDIT F15 F17 F19 F25).

import type { Page } from '@playwright/test';
import { activeScenarioName, expect, reloadApp, test } from './fixtures';

const toScenarios = (page: Page) =>
  page.locator('nav').getByRole('button', { name: 'Scenarios', exact: true }).click();

/** The identity dot of a compare-table row, by scenario name. */
const rowDotColor = (page: Page, name: string) =>
  page
    .getByRole('row')
    .filter({ has: page.getByText(name, { exact: true }) })
    .locator('span')
    .first()
    .evaluate((el) => el.style.background);

test('deleting a scenario never repaints the survivors', async ({ seedApp: page }) => {
  await toScenarios(page);
  await page.getByRole('button', { name: '+ New blank' }).click();
  await page.getByRole('button', { name: '+ New blank' }).click();

  const s2Before = await rowDotColor(page, 'Scenario 2');
  const s3Before = await rowDotColor(page, 'Scenario 3');
  expect(s2Before).not.toBe(s3Before);

  await page.getByRole('button', { name: 'Delete Demo Plan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('row').filter({ has: page.getByText('Demo Plan', { exact: true }) })).toHaveCount(0);

  // Survivors keep their exact colors — identity, not index (the old bug shifted them).
  expect(await rowDotColor(page, 'Scenario 2')).toBe(s2Before);
  expect(await rowDotColor(page, 'Scenario 3')).toBe(s3Before);

  // Persisted: wait out the debounced autosave, reload, check again.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const open = indexedDB.open('firepath');
            open.onsuccess = () => {
              const db = open.result;
              const all = db.transaction('scenarios', 'readonly').objectStore('scenarios').getAll();
              all.onsuccess = () => { db.close(); resolve((all.result as unknown[]).length); };
              all.onerror = () => { db.close(); resolve(-1); };
            };
            open.onerror = () => resolve(-1);
          }),
      ),
    )
    .toBe(2);
  await reloadApp(page);
  await toScenarios(page);
  expect(await rowDotColor(page, 'Scenario 2')).toBe(s2Before);
  expect(await rowDotColor(page, 'Scenario 3')).toBe(s3Before);
});

test('duplicating announces the switch and Edit plan lands on the Plan tab', async ({ seedApp: page }) => {
  await toScenarios(page);
  await page.getByRole('button', { name: 'Duplicate Demo Plan' }).click();

  const toast = page.getByRole('status');
  await expect(toast).toContainText('Now editing "Demo Plan (copy)"');
  await toast.getByRole('button', { name: 'Edit plan →' }).click();

  await expect(page.getByText('Household', { exact: true })).toBeVisible();
  await expect(activeScenarioName(page)).toHaveText('Demo Plan (copy)');
});

test('full resets demand typing RESET; cancel leaves everything intact', async ({ seedApp: page }) => {
  await page.getByRole('button', { name: 'Backup ▾' }).click();
  await page.getByRole('menuitem', { name: /Reset to blank plan/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Reset' })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(activeScenarioName(page)).toHaveText('Demo Plan');

  // Now for real: type the word, confirm, and the store is wiped to a blank plan.
  await page.getByRole('menuitem', { name: /Reset to blank plan/ }).click();
  await page.getByRole('textbox', { name: 'Type RESET to confirm' }).fill('RESET');
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await expect(activeScenarioName(page)).toHaveText('Blank Plan');
  await expect(page.locator('select[aria-label="Active scenario"] option')).toHaveCount(1);
});

test('scenario delete is a one-click confirm popover, not a native dialog', async ({ seedApp: page }) => {
  // A native confirm() would auto-dismiss under Playwright and the delete would no-op.
  page.on('dialog', () => { throw new Error('native dialog appeared'); });
  await toScenarios(page);
  await page.getByRole('button', { name: 'Duplicate Demo Plan' }).click();
  await page.getByRole('button', { name: 'Delete Demo Plan (copy)', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('row').filter({ has: page.getByText('Demo Plan (copy)', { exact: true }) })).toHaveCount(0);
});

test('the Spending +10% preset produces a measurably weaker scenario', async ({ seedApp: page }) => {
  test.setTimeout(90_000); // two 10k-trial Monte Carlo runs under parallel load
  await toScenarios(page);
  await page.getByRole('button', { name: 'Spending +10%', exact: true }).click();

  const successOf = async (name: string) => {
    const text = await page
      .getByRole('row')
      .filter({ has: page.getByText(name, { exact: true }) })
      .locator('td')
      .nth(4)
      .textContent();
    return text?.endsWith('%') ? parseFloat(text) : null;
  };

  await expect.poll(() => successOf('Demo Plan'), { timeout: 60_000 }).not.toBeNull();
  await expect.poll(() => successOf('Demo Plan — spending +10%'), { timeout: 60_000 }).not.toBeNull();

  const base = (await successOf('Demo Plan'))!;
  const stressed = (await successOf('Demo Plan — spending +10%'))!;
  expect(stressed).toBeLessThan(base);
});
