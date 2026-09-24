import { expect, test } from '@playwright/test';

/** The home page's five acceptance rows, each one click from a comparison (FR-16). */

const ROWS = [
  'Surprised creature at combat start',
  'Spend inspiration on an attack',
  '“Use an Object” action',
  'Attack with a weapon mastery property',
  'Melee vs prone + house flanking',
];

test('lists the five acceptance scenarios', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Acceptance scenarios' })).toBeVisible();
  await expect(page.getByTestId('acceptance-row')).toHaveCount(5);
  for (const title of ROWS) {
    await expect(page.getByRole('link', { name: `Compare: ${title}` })).toBeVisible();
  }
});

for (const title of ROWS) {
  test(`"${title}" opens a comparison of both profiles`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: `Compare: ${title}` }).click();

    await expect(page).toHaveURL(/\/compare\?scenario=.+&a=.+&b=.+&seed=demo$/);
    await expect(page.getByTestId('diff-summary')).toBeVisible();
    await expect(page.getByTestId('compare-side-A')).toBeVisible();
    await expect(page.getByTestId('compare-side-B')).toBeVisible();
  });
}

test('the surprise row shows combat.surprise differing between the editions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: `Compare: ${ROWS[0]}` }).click();

  await expect(page.getByTestId('diff-summary')).toContainText('combat.surprise');
});
