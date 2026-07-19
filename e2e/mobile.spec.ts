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
  const scroller = page.getByTestId('nav-tabs');
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

// ---------------------------------------------------------------------------
// P1: slim sticky chrome, sticky table columns, finger-sized targets.

test('mobile: a compact verdict rides the sticky bar and survives scrolling', async ({ seedApp: page }) => {
  const verdict = page.getByTestId('mobile-verdict');
  await expect(verdict).toContainText('FI $2.0M');
  await expect(verdict).toContainText('success');

  // Scroll deep into the form — the verdict must still sit at the top of the screen.
  await page.evaluate(() => window.scrollTo(0, 1500));
  await expect(verdict).toBeVisible();
  const box = await verdict.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(10);
});

test('mobile: the projection table pins the Age column while the rest scrolls', async ({ seedApp: page }) => {
  await page.locator('nav').getByRole('button', { name: 'Projection', exact: true }).click();
  const firstCell = page.getByRole('button', { name: 'View cash flow at age 35' });
  await expect(firstCell).toBeVisible();
  const before = await firstCell.boundingBox();

  // Scroll the table container far right; the age cell must not move.
  await page.locator('table').first().evaluate((table) => {
    table.parentElement!.scrollLeft = 500;
  });
  await expect.poll(() => page.locator('table').first().evaluate((t) => t.parentElement!.scrollLeft)).toBeGreaterThan(400);
  const after = await firstCell.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
});

test('mobile: interactive controls meet the touch-size floor', async ({ seedApp: page }) => {
  // ⓘ help buttons: 16px glyph, 32px hit area via padding.
  const help = page.getByLabel('About Expected return', { exact: true }).first();
  const helpBox = await help.boundingBox();
  expect(helpBox!.width).toBeGreaterThanOrEqual(30);
  expect(helpBox!.height).toBeGreaterThanOrEqual(30);

  // Segmented toggles and ghost buttons stretch to a real row height.
  expect((await page.getByRole('button', { name: 'Solo', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(34);
  expect((await page.getByRole('button', { name: 'Backup ▾' }).boundingBox())!.height).toBeGreaterThanOrEqual(38);

  // Withdrawal-order arrows were 14×16 — the least tappable controls in the app.
  const arrow = page.getByLabel('Move Taxable brokerage earlier');
  const arrowBox = await arrow.boundingBox();
  expect(arrowBox!.width).toBeGreaterThanOrEqual(28);
  expect(arrowBox!.height).toBeGreaterThanOrEqual(28);
});

test('mobile: milestone table rows are the phone-sized path to cash flow', async ({ seedApp: page }) => {
  await page.locator('nav').getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.getByRole('button', { name: 'Kid starts college — cash flow at age 53' }).click();
  await expect(page.getByText(/Age 53 · \d{4}/)).toBeVisible();
});

// ---------------------------------------------------------------------------
// P2: touch slider thumbs, table legibility, honest lever display.

test('mobile: sliders grow a finger-sized thumb on coarse pointers', async ({ seedApp: page }) => {
  // hasTouch makes Chromium report a coarse pointer, which scopes the thumb CSS.
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  const slider = page.getByLabel('Retire at age slider');
  const box = await slider.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(24);
  const thumbH = await slider.evaluate(
    (el) => getComputedStyle(el, '::-webkit-slider-thumb').height,
  );
  expect(parseFloat(thumbH)).toBeGreaterThanOrEqual(20);
});

test('mobile: the spending lever shows the exact plan value, never a snapped one', async ({ seedApp: page }) => {
  // At retire-age 45 the lever binds to current spending ($72k). With the old 5k
  // slider step the range input snapped its position to $70k — a wrong-looking number.
  await page.getByLabel('Retire at age', { exact: true }).fill('45');
  await expect(page.getByLabel('Spending in retirement slider')).toHaveJSProperty('value', '72000');
});

test('mobile: projection table cells are 13px on phones', async ({ seedApp: page }) => {
  await page.locator('nav').getByRole('button', { name: 'Projection', exact: true }).click();
  const fontSize = await page
    .locator('tbody td')
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize);
  expect(fontSize).toBe('13px');
});
