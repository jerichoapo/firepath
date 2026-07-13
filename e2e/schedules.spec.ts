// Contribution schedules (D28): the demo's seeded 401(k) schedule is visible and
// editable, edits move the live projection and survive reload and a full
// export → wipe → import round trip, inert changes warn inline, and the
// funded-vs-planned footer reacts when a schedule over-plans an age.

import type { Page } from '@playwright/test';
import { activeScenarioName, expect, headerMetric, reloadApp, test } from './fixtures';

/** The Accounts card (labels like "From age" also exist in the Spending card). */
const accountsCard = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Accounts' }) });

const openTradSchedule = (page: Page) =>
  page.getByRole('button', { name: 'Vary 401(k) / Trad IRA contribution by age' }).click();

/** Poll IndexedDB until the persisted scenarios JSON satisfies the substring —
 *  the autosave is debounced 400 ms, so reloads must not race it. */
async function waitForPersistedText(page: Page, needle: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const open = indexedDB.open('firepath');
            open.onsuccess = () => {
              const db = open.result;
              const all = db.transaction('scenarios', 'readonly').objectStore('scenarios').getAll();
              all.onsuccess = () => { db.close(); resolve(JSON.stringify(all.result)); };
              all.onerror = () => { db.close(); resolve(''); };
            };
            open.onerror = () => resolve('');
          }),
      ),
    )
    .toContain(needle);
}

test('the demo schedule is visible; edits move the projection, persist, and reload', async ({ seedApp: page }) => {
  test.setTimeout(60_000);
  // The seeded 401(k) schedule shows as a collapsed summary.
  await expect(page.getByText('$32k → $10k @50')).toBeVisible();

  await openTradSchedule(page);
  const card = accountsCard(page);
  await expect(card.getByLabel('From age', { exact: true })).toHaveValue('50');

  // Add a second step: from 52, stop contributing entirely.
  await card.getByRole('button', { name: '+ Add change at age…' }).click();
  await card.getByLabel('From age', { exact: true }).last().fill('52');
  await card.getByLabel('New amount').last().fill('0');

  // The year-by-year table shows the drop: 401(k) 10k + HSA 8k saved at 52 becomes HSA-only.
  // (Contribution edits mostly reallocate between accounts, so $M-rounded net-worth
  // readouts are the wrong observable — the per-year Saved cell is exact.)
  await page.locator('nav').getByRole('button', { name: 'Projection', exact: true }).click();
  const row52 = page.getByRole('row').filter({ hasText: '52 · ' });
  await expect(row52).toContainText('$8k');
  const row51 = page.getByRole('row').filter({ hasText: '51 · ' });
  await expect(row51).toContainText('$18k');

  // Back on the Plan tab the editor is collapsed again (tab switch remounts the view) —
  // the summary reflects the new step; reload → it persisted.
  await page.locator('nav').getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('$32k → $10k @50 → $0 @52')).toBeVisible();
  await waitForPersistedText(page, '"fromAge":52');
  await reloadApp(page);
  await expect(page.getByText('$32k → $10k @50 → $0 @52')).toBeVisible();
});

test('inert changes warn inline and the warning clears when fixed', async ({ seedApp: page }) => {
  const card = accountsCard(page);
  await page.getByRole('button', { name: 'Vary Roth IRA contribution by age' }).click();
  await card.getByRole('button', { name: '+ Add change at age…' }).click();

  // At/after retirement (55) the change is inert — the engine copes, the UI says so.
  await card.getByLabel('From age', { exact: true }).fill('60');
  await expect(card.getByText(/Never takes effect/)).toBeVisible();

  await card.getByLabel('From age', { exact: true }).fill('45');
  await expect(card.getByText(/Never takes effect/)).toHaveCount(0);
});

test('over-planning a later age flips the funded footer; removing the change restores it', async ({ seedApp: page }) => {
  const footer = page.getByTestId('funding-status');
  await expect(footer).toBeVisible();
  const baseline = await footer.textContent();

  // Plan $200k/yr of 401(k) from 45 — far beyond income at that age.
  await openTradSchedule(page);
  const card = accountsCard(page);
  await card.getByRole('button', { name: '+ Add change at age…' }).click();
  await card.getByLabel('From age', { exact: true }).last().fill('45');
  await card.getByLabel('New amount').last().fill('200000');
  await expect(footer).not.toHaveText(baseline!);
  await expect(footer).toContainText("can't fund");

  await card.getByTitle('Remove change').last().click();
  await expect(footer).toHaveText(baseline!);
});

test('a plan whose income covers every year shows the fully-funded state', async ({ blankApp: page }) => {
  // Blank plan: one default income stream + one small contribution = always fundable.
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Income streams' }) })
    .getByRole('button', { name: '+ Add' })
    .click();
  await accountsCard(page).getByLabel('Taxable brokerage contribution per year').fill('5000');
  await expect(page.getByTestId('funding-status')).toContainText('fully funded');
});

test('schedules survive an export → wipe → import round trip', async ({ seedApp: page }) => {
  test.setTimeout(60_000);
  await expect(page.getByText('$32k → $10k @50')).toBeVisible();

  // Real export through the Backup menu.
  await page.getByRole('button', { name: 'Backup ▾' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Export plan JSON/ }).click();
  const exported = (await (await downloadPromise).path())!;

  // Full wipe, then import the file back through the chooser.
  await page.getByRole('button', { name: 'Backup ▾' }).click();
  await page.getByRole('menuitem', { name: /Reset to blank plan/ }).click();
  await page.getByRole('textbox', { name: 'Type RESET to confirm' }).fill('RESET');
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await expect(activeScenarioName(page)).toHaveText('Blank Plan');

  await page.getByRole('button', { name: 'Backup ▾' }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /Import plan JSON/ }).click();
  await (await chooserPromise).setFiles(exported);

  await expect(activeScenarioName(page)).toHaveText('Demo Plan');
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
  await expect(page.getByText('$32k → $10k @50')).toBeVisible();
  await openTradSchedule(page);
  await expect(accountsCard(page).getByLabel('From age', { exact: true })).toHaveValue('50');
});
