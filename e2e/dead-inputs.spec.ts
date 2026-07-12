// Phase 2 acceptance: every visible control changes something — inflation removed,
// downshift demoted to a timeline marker, partner SS actually wired (UX_AUDIT F4 F24 F27).

import { expect, test } from './fixtures';

test('the inflation knob is gone and the real-dollars convention is stated', async ({ seedApp: page }) => {
  const assumptions = page.locator('section').filter({ hasText: 'Assumptions' });
  await expect(assumptions.getByText(/today's dollars/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Inflation/i })).toHaveCount(0);
});

test('the FI multiplier explains itself as a withdrawal rate', async ({ blankApp: page }) => {
  await expect(page.getByText(/FI multiplier \(= 4\.0% withdrawal rate\)/)).toBeVisible();
  await page.getByRole('textbox', { name: /FI multiplier/ }).fill('20');
  await expect(page.getByText(/FI multiplier \(= 5\.0% withdrawal rate\)/)).toBeVisible();
});

test('partner Social Security fields exist only in couple mode', async ({ seedApp: page }) => {
  const partnerSs = page.getByRole('textbox', { name: /Social Security — partner/ });
  await expect(partnerSs).toBeVisible();
  await page.getByRole('button', { name: 'Solo', exact: true }).click();
  await expect(partnerSs).toHaveCount(0);
  await page.getByRole('button', { name: 'Couple', exact: true }).click();
  await expect(partnerSs).toBeVisible();
});

test('the partner benefit steps household income up a second time', async ({ seedApp: page }) => {
  // Demo: you claim $24k at 67; the partner (a year younger) adds $18k when you're 68.
  await page.locator('nav').getByRole('button', { name: 'Projection', exact: true }).click();
  const rowAt = (age: number) => page.getByRole('row').filter({ hasText: new RegExp(`^${age} · \\d{4}`) });
  await expect(rowAt(66)).toContainText('$0');
  await expect(rowAt(67)).toContainText('$24k');
  await expect(rowAt(68)).toContainText('$42k');
});

test('downshift age lives with milestones and moves only the timeline marker', async ({ blankApp: page }) => {
  const household = page.locator('section').filter({ hasText: 'Ages drive the whole timeline' });
  await expect(household.getByRole('textbox', { name: /Downshift/ })).toHaveCount(0);

  const milestones = page.locator('section').filter({ hasText: 'Your milestones' });
  const downshift = milestones.getByRole('textbox', { name: /Downshift/ });
  await expect(downshift).toBeVisible();
  await downshift.fill('42');

  await page.locator('nav').getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Downshift' })).toContainText('42');
});

test('the Roth-ladder simplification is disclosed where it bites', async ({ blankApp: page }) => {
  await expect(page.getByText(/Roth conversion ladder/i)).toBeVisible();
});
