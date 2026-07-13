// Import hardening acceptance (D27): a genuine export survives a full wipe and restore
// through the real menu/file-chooser path, and hostile files — garbage bytes or
// right-shape-wrong-types — bounce off with a toast while the store stays untouched,
// including across a reload (nothing bad may reach the debounced autosave).

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { activeScenarioName, expect, headerMetric, reloadApp, test } from './fixtures';

/** Feed a file to the (always-mounted) hidden import input — same handler as the menu path. */
const importFile = (page: Page, name: string, content: string) =>
  page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(content, 'utf8'),
  });

/** Download a real export via the Backup menu and return its file path. */
async function exportPlan(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Backup ▾' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Export plan JSON/ }).click();
  const download = await downloadPromise;
  return (await download.path())!;
}

/** Wait until the debounced autosave has persisted the given scenario names to IndexedDB —
 *  reloading earlier would race the 400ms debounce and read the previous store. */
async function waitForPersistedScenarios(page: Page, names: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const open = indexedDB.open('firepath');
            open.onsuccess = () => {
              const db = open.result;
              const all = db.transaction('scenarios', 'readonly').objectStore('scenarios').getAll();
              all.onsuccess = () => {
                db.close();
                resolve((all.result as { name: string }[]).map((s) => s.name).sort().join(','));
              };
              all.onerror = () => { db.close(); resolve(''); };
            };
            open.onerror = () => resolve('');
          }),
      ),
    )
    .toBe(names);
}

test('a real export survives a full wipe and restores through the file chooser', async ({ seedApp: page }) => {
  // Chains download → type-RESET wipe → file chooser → reload under parallel load.
  test.setTimeout(60_000);
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
  const exported = await exportPlan(page);

  // Wipe everything via the type-RESET flow.
  await page.getByRole('button', { name: 'Backup ▾' }).click();
  await page.getByRole('menuitem', { name: /Reset to blank plan/ }).click();
  await page.getByRole('textbox', { name: 'Type RESET to confirm' }).fill('RESET');
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await expect(activeScenarioName(page)).toHaveText('Blank Plan');
  await expect(headerMetric(page, 'FI number')).toHaveText('—');

  // Import through the real menu → native chooser path.
  await page.getByRole('button', { name: 'Backup ▾' }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /Import plan JSON/ }).click();
  await (await chooserPromise).setFiles(exported);

  await expect(activeScenarioName(page)).toHaveText('Demo Plan');
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');

  // The restore persists (wait out the debounced autosave before reloading).
  await waitForPersistedScenarios(page, 'Demo Plan');
  await reloadApp(page);
  await expect(activeScenarioName(page)).toHaveText('Demo Plan');
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
});

test('garbage bytes bounce off with a toast; the store is untouched', async ({ seedApp: page }) => {
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');

  await importFile(page, 'garbage.json', 'this is not json {{{');
  await expect(page.getByRole('status')).toContainText('Could not parse that file as JSON');

  await importFile(page, 'other-app.json', JSON.stringify({ app: 'other', scenarios: [{}] }));
  await expect(page.getByRole('status')).toContainText('Not a FirePath export file');

  await expect(activeScenarioName(page)).toHaveText('Demo Plan');
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
});

test('right shape, wrong types is rejected by path — no NaN ever reaches the store', async ({ seedApp: page }) => {
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');

  // Doctor a genuine export: the exact attack the validator exists for.
  const doctored = JSON.parse(readFileSync(await exportPlan(page), 'utf8')) as {
    scenarios: { plan: { accounts: { taxable: { balance: unknown } } } }[];
  };
  doctored.scenarios[0].plan.accounts.taxable.balance = '120000';
  await importFile(page, 'doctored.json', JSON.stringify(doctored));

  await expect(page.getByRole('status')).toContainText(
    'scenarios[0].plan.accounts.taxable.balance should be a finite number',
  );
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');

  // Nothing bad was persisted: a reload still shows the intact demo.
  await reloadApp(page);
  await expect(activeScenarioName(page)).toHaveText('Demo Plan');
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
});

test('a rejected file can be fixed and re-imported under the same name', async ({ seedApp: page }) => {
  const exported = readFileSync(await exportPlan(page), 'utf8');
  const broken = JSON.parse(exported) as { scenarios: { plan: { mc: { mode: string } } }[] };
  broken.scenarios[0].plan.mc.mode = 'quantum';

  await importFile(page, 'plan.json', JSON.stringify(broken));
  await expect(page.getByRole('status')).toContainText('mc.mode');

  // Same filename, fixed content — the input resets after each attempt, so change fires again.
  await importFile(page, 'plan.json', exported);
  await expect(activeScenarioName(page)).toHaveText('Demo Plan');
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
});

test('a pre-color export imports cleanly and gets identity colors backfilled', async ({ seedApp: page }) => {
  const old = JSON.parse(readFileSync(await exportPlan(page), 'utf8')) as {
    scenarios: Record<string, unknown>[];
  };
  delete old.scenarios[0].color;
  await importFile(page, 'old-export.json', JSON.stringify(old));

  await expect(activeScenarioName(page)).toHaveText('Demo Plan');
  // The compare table dot renders from the backfilled color.
  await page.locator('nav').getByRole('button', { name: 'Scenarios', exact: true }).click();
  const dot = page
    .getByRole('row')
    .filter({ has: page.getByText('Demo Plan', { exact: true }) })
    .locator('span')
    .first();
  await expect(dot).toHaveCSS('background-color', 'rgb(42, 120, 214)'); // #2a78d6, first palette slot
});
