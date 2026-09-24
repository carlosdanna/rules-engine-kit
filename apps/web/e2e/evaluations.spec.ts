import { expect, test } from '@playwright/test';

/**
 * `/playground` and `/evaluations/[id]`, without running anything (ADR-0030).
 *
 * Read-only for the same reason as `scenarios.spec.ts`: a run is stored, the suite shares
 * `data/app.db`, and `db:reset` never deletes a user row. Running, storing and replaying are
 * asserted in `lib/evaluations/run.test.ts` against an in-memory database instead.
 */

test('the playground offers the seeded scenarios, profiles and a seed', async ({ page }) => {
  await page.goto('/playground');

  await expect(page.getByRole('heading', { name: 'Playground' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Scenario' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Profile' })).toBeVisible();
  await expect(page.getByLabel('Seed')).toHaveValue('demo');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
});

test('"Open in playground" preselects the scenario and its suggested profile', async ({ page }) => {
  await page.goto('/scenarios/melee-attack');
  await page.getByRole('link', { name: 'Open in playground' }).click();

  await expect(page).toHaveURL(/\/playground\?scenario=melee-attack$/);
  await expect(page.getByRole('combobox', { name: 'Scenario' })).toHaveText(/Melee attack/);
  await expect(page.getByRole('combobox', { name: 'Profile' })).toHaveText(/srd-/);
});

test('an unknown evaluation is a 404', async ({ page }) => {
  const response = await page.goto('/evaluations/00000000-0000-0000-0000-000000000000');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'No such evaluation' })).toBeVisible();
});
