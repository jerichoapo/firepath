// Playwright fixtures that control the app's IndexedDB state *before* the app loads,
// so every test starts from a known store regardless of order or parallelism.

import { test as base, expect, type Page } from '@playwright/test';

/**
 * Delete the app database from a same-origin page that does NOT run the app
 * (a static asset). With no Dexie connection open, deleteDatabase can't be
 * blocked and no debounced autosave can race the wipe.
 */
export async function wipeDb(page: Page): Promise<void> {
  await page.goto('/flame.svg');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('firepath');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
      }),
  );
}

/** Navigate to the app and wait until it has loaded past the store-loading screen. */
export async function loadApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FirePath' })).toBeVisible();
}

interface AppFixtures {
  /** First run: database wiped, app loads and seeds the demo household. */
  freshApp: Page;
  /**
   * Demo data present and ready to use. Identical to freshApp today; diverges in
   * Phase 1 (freshApp = first-run banners visible, seedApp = banners dismissed).
   */
  seedApp: Page;
  /** A blank scenario is active, created through the UI the way a user would. */
  blankApp: Page;
}

export const test = base.extend<AppFixtures>({
  freshApp: async ({ page }, use) => {
    await wipeDb(page);
    await loadApp(page);
    await use(page);
  },
  seedApp: async ({ freshApp }, use) => {
    await use(freshApp);
  },
  blankApp: async ({ freshApp }, use) => {
    await freshApp.getByRole('button', { name: 'Data ▾' }).click();
    await freshApp.getByRole('button', { name: /New blank scenario/ }).click();
    await expect(activeScenarioName(freshApp)).toHaveText('New Scenario');
    await use(freshApp);
  },
});

/** The currently selected option in the header's scenario switcher. */
export function activeScenarioName(page: Page) {
  return page.locator('select[aria-label="Active scenario"] option:checked');
}

/** The value <p> of a header metric chip, located from its uppercase label.
 *  Scoped to the banner — labels like "FI number" also appear inside views. */
export function headerMetric(page: Page, label: string) {
  return page.getByRole('banner').getByText(label, { exact: true }).locator('xpath=following-sibling::p');
}

export { expect };
