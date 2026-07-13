// Phase 4 acceptance: menus close, computing looks like computing, results never vanish,
// reordering goes both ways, money reads like money, the theme button says what it is
// (UX_AUDIT F11 F12 F14 F16 F18 F30).

import type { Page } from '@playwright/test';
import { expect, headerMetric, reloadApp, test } from './fixtures';

/** Balance input of an account row in the Accounts card (label cell → first NumField). */
const balanceField = (page: Page, account: string) =>
  page.getByText(account, { exact: true }).locator('xpath=following-sibling::label[1]//input');

test('the backup menu closes on outside click and on Escape', async ({ seedApp: page }) => {
  const trigger = page.getByRole('button', { name: 'Backup ▾' });

  await trigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('heading', { name: 'FirePath', exact: true }).click();
  await expect(page.getByRole('menu')).not.toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).not.toBeVisible();
});

test('editing the plan dims the stale success number instead of clearing it', async ({ seedApp: page }) => {
  const success = headerMetric(page, 'Success');
  await expect(success).toHaveText(/^[\d.]+%$/, { timeout: 20_000 });
  const before = (await success.textContent())!;

  await page.getByRole('textbox', { name: 'Current annual spending' }).fill('61234');

  // The old percent stays on screen, dimmed and marked as computing — never "…NN%".
  const marker = page.getByRole('banner').locator('p[data-computing]');
  await expect(marker).toBeVisible();
  await expect(success).toContainText(before);
  await expect(success).toHaveText(/^[\d.]+%/);

  // The fresh value lands and the computing marker goes away.
  await expect(success).toHaveText(/^[\d.]+%$/, { timeout: 20_000 });
  await expect(marker).not.toBeVisible();
});

test('the fan chart stays mounted, dimmed, while simulations recompute', async ({ seedApp: page }) => {
  // Two full 10k-trial Monte Carlo runs under parallel-worker CPU load.
  test.setTimeout(60_000);
  await page.locator('nav').getByRole('button', { name: 'Monte Carlo', exact: true }).click();
  const gauge = page.locator('section').filter({ hasText: 'Chance of success' });
  const fan = page.locator('section').filter({ hasText: 'Net worth percentile bands' });
  const histogram = page.locator('section').filter({ hasText: 'Distribution of ending net worth' });
  await expect(gauge.getByText(/^[\d.]+%$/)).toBeVisible({ timeout: 20_000 });
  // .first(): the card also hosts the failure strip's chart container (Phase 7).
  await expect(fan.locator('.recharts-responsive-container').first()).toBeVisible();

  await page.getByRole('textbox', { name: 'Trials' }).fill('4600');

  // Charts and gauge keep their (stale) content — no collapse into a progress screen.
  await expect(fan.locator('.recharts-responsive-container').first()).toBeVisible();
  await expect(histogram.locator('.recharts-responsive-container')).toBeVisible();
  await expect(gauge.getByText(/^[\d.]+%$/)).toBeVisible();
  await expect(gauge.getByText(/Computing/)).not.toBeVisible();

  // The fresh run (4,600 trials) replaces the stale one.
  await expect(gauge.getByText(/4,600 trials/)).toBeVisible({ timeout: 20_000 });
});

test('withdrawal order moves both directions and survives a reload', async ({ seedApp: page }) => {
  const rows = page.locator('ol').filter({ hasText: 'Taxable brokerage' }).locator('li');
  await expect(rows.first()).toContainText('Taxable brokerage');

  await page.getByRole('button', { name: 'Move Taxable brokerage later' }).click();
  await expect(rows.first()).toContainText('401(k) / Trad IRA');
  await expect(rows.nth(1)).toContainText('Taxable brokerage');

  await page.getByRole('button', { name: 'Move Taxable brokerage earlier' }).click();
  await expect(rows.first()).toContainText('Taxable brokerage');

  // Land on a changed order, wait for the debounced autosave, and reload.
  await page.getByRole('button', { name: 'Move HSA earlier' }).click();
  await expect(rows.nth(2)).toContainText('HSA');
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
                const rows = all.result as { plan: { tax: { withdrawalOrder: string[] } } }[];
                resolve(rows[0]?.plan.tax.withdrawalOrder.join(',') ?? '');
              };
              all.onerror = () => { db.close(); resolve(''); };
            };
            open.onerror = () => resolve('');
          }),
      ),
    )
    .toBe('taxable,trad,hsa,roth');

  await reloadApp(page);
  await expect(page.locator('ol').filter({ hasText: 'Taxable brokerage' }).locator('li').nth(2))
    .toContainText('HSA');
});

test('balance fields read with thousands separators at rest, raw digits while editing', async ({ seedApp: page }) => {
  const taxable = balanceField(page, 'Taxable brokerage');
  await expect(taxable).toHaveValue('120,000');

  await taxable.click();
  await expect(taxable).toHaveValue('120000');

  await taxable.fill('987654');
  await taxable.press('Enter');
  await expect(taxable).toHaveValue('987,654');

  // Small fields (ages) are naturally unaffected.
  await expect(page.getByRole('textbox', { name: 'Your claiming age' })).toHaveValue('67');
});

test('the theme toggle announces its state and flips the glyph', async ({ seedApp: page }) => {
  const toggle = page.getByRole('button', { name: /theme/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveText('☀️');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveText('🌙');
  await expect(page.locator('html')).toHaveClass(/dark/);

  // The choice persists across reloads (localStorage, applied before first paint).
  await reloadApp(page);
  await expect(page.getByRole('button', { name: /theme/ })).toHaveAttribute('aria-pressed', 'true');
});
