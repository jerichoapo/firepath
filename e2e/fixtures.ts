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

/** Navigate to the app and wait until it has loaded past the store-loading screen.
 *  Generous timeout: a cold vite dev-server load under full parallel-worker CPU load
 *  can exceed the 5s expect default. */
export async function loadApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FirePath', exact: true })).toBeVisible({ timeout: 15_000 });
}

interface AppFixtures {
  /** First run: database wiped, app loads and seeds the demo household (banners visible). */
  freshApp: Page;
  /** Demo data present, first-run banners dismissed — a "settled" app. */
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
    await freshApp.getByRole('button', { name: 'Explore the demo' }).click();
    await freshApp.getByRole('button', { name: '✕ Got it' }).click();
    await use(freshApp);
  },
  blankApp: async ({ freshApp }, use) => {
    await freshApp.getByRole('button', { name: 'Backup ▾' }).click();
    await freshApp.getByRole('menuitem', { name: /New blank scenario/ }).click();
    await expect(activeScenarioName(freshApp)).toHaveText('New Scenario');
    await use(freshApp);
  },
});

/** The currently selected option in the header's scenario switcher. */
export function activeScenarioName(page: Page) {
  return page.locator('select[aria-label="Active scenario"] option:checked');
}

/** The value <p> of a header metric chip, located from its uppercase label.
 *  Substring match: some labels carry a suffix tag (e.g. "Success · normal MC").
 *  Scoped to the banner — labels like "FI number" also appear inside views. */
export function headerMetric(page: Page, label: string) {
  return page.getByRole('banner').getByText(label).locator('xpath=following-sibling::p');
}

/** Wait until a UI flag (banner dismissal) has actually been persisted to IndexedDB —
 *  saves are debounced 400 ms, so reload-persistence tests must not race them. */
export async function waitForFlag(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (k) =>
            new Promise<boolean>((resolve) => {
              const open = indexedDB.open('firepath');
              open.onsuccess = () => {
                const db = open.result;
                const get = db.transaction('meta', 'readonly').objectStore('meta').get('uiFlags');
                get.onsuccess = () => {
                  db.close();
                  try {
                    const row = get.result as { value?: string } | undefined;
                    resolve(Boolean((JSON.parse(row?.value ?? '{}') as Record<string, boolean>)[k]));
                  } catch {
                    resolve(false);
                  }
                };
                get.onerror = () => { db.close(); resolve(false); };
              };
              open.onerror = () => resolve(false);
            }),
          key,
        ),
      { timeout: 5_000 },
    )
    .toBe(true);
}

/** Reload and wait for the app to be interactive again. */
export async function reloadApp(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByRole('heading', { name: 'FirePath', exact: true })).toBeVisible({ timeout: 15_000 });
}

export { expect };
