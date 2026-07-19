// Mobile UX regressions (Phase 9): the same app at a phone viewport. These tests
// pin the P0 audit fixes — a 375px visitor must see the verdict, use every field,
// and be able to find every tab. Runs in the desktop chromium project with the
// viewport overridden, so no extra Playwright project is needed.

import { expect, headerMetric, test } from './fixtures';

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

test('mobile: the header verdict metrics are visible, not crushed to zero width', async ({ seedApp: page }) => {
  // Pre-fix, flexbox shrank every metric to 0px — the core type→verdict loop was gone.
  await expect(headerMetric(page, 'FI number')).toHaveText('$2.0M');
  for (const label of ['Net worth today', 'FI number', 'Projected FI']) {
    const box = await headerMetric(page, label).boundingBox();
    expect(box, `${label} should have real width`).not.toBeNull();
    expect(box!.width, `${label} width`).toBeGreaterThan(25);
  }
});

test('mobile: income and account fields are wide enough to read and type in', async ({ seedApp: page }) => {
  // Pre-fix, the 7-column income row squeezed the Annual input to 9px.
  const annual = page.getByLabel('Annual', { exact: true }).first();
  const annualBox = await annual.boundingBox();
  expect(annualBox!.width).toBeGreaterThan(100);

  const balance = page.getByLabel('401(k) / Trad IRA balance');
  const balanceBox = await balance.boundingBox();
  expect(balanceBox!.width).toBeGreaterThan(90);

  // 16px inputs on mobile — anything smaller makes iOS Safari auto-zoom on focus.
  for (const locator of [annual, balance]) {
    const fontSize = await locator.evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe('16px');
  }
});

test('mobile: every tab is reachable and the active tab scrolls into view', async ({ seedApp: page }) => {
  const scroller = page.locator('nav > div').first();
  // The strip genuinely overflows at 375px…
  const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeGreaterThan(50);
  // …so the edge fade must be present as the scroll affordance.
  await expect(page.getByTestId('nav-fade')).toBeVisible();

  // Activating the right-most tab scrolls it into view (aria-current + effect).
  await page.locator('nav').getByRole('button', { name: 'Cash Flow' }).click();
  await expect(page.getByRole('heading', { name: 'Cash flow by year' })).toBeVisible();
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

test('mobile: the page never scrolls horizontally on the Plan tab', async ({ seedApp: page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
