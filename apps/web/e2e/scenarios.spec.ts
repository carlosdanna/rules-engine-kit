import { expect, test } from '@playwright/test';

/**
 * `/scenarios` and `/scenarios/new`, without writing anything (FR-18, FR-19).
 *
 * This suite is deliberately read-only. Playwright runs against the repository's own
 * `data/app.db` with no isolation — see `playwright.config.ts` — and `pnpm db:reset` deletes
 * only `origin = 'seed'` rows (ADR-0004), so a test that created a scenario would leave a row
 * behind that nothing cleans up. The create, edit and delete rules are asserted instead in
 * `apps/web/lib/scenarios/write.test.ts`, against an in-memory database.
 *
 * What is left is still worth asserting, and one case in particular: the generated form's live
 * preview is rendered by `renderTemplate` running *in the browser* (NFR-3). Nothing else in the
 * app exercises that, and no unit test can.
 *
 * Dialogs are always located by accessible name. `sheet.tsx` and `dialog.tsx` both wrap Base
 * UI's dialog primitive, so a bare `getByRole('dialog')` would be ambiguous across suites.
 */

const SEEDED = [
  'Melee attack',
  'Ranged attack against a target in cover',
  'Combat start, with a surprised creature',
  'Ability check against a DC',
];

test('lists the seeded scenarios and marks them as seeded', async ({ page }) => {
  await page.goto('/scenarios');

  for (const name of SEEDED) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
  // Six seeded rows, and none of them offers an edit or a delete.
  await expect(page.getByText('seed', { exact: true })).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
});

test('a seeded scenario can be exported but not edited', async ({ page }) => {
  await page.goto('/scenarios/melee-attack');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Melee attack');
  await expect(page.getByRole('button', { name: 'Export YAML' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.getByText('rebuilt by every')).toBeVisible();
});

test('the edit route refuses a seeded scenario', async ({ page }) => {
  const response = await page.goto('/scenarios/melee-attack/edit');
  expect(response?.status()).toBe(404);
});

test('the new-scenario dialog offers all three ways in', async ({ page }) => {
  await page.goto('/scenarios');
  await page.getByRole('button', { name: 'New scenario' }).click();

  const dialog = page.getByRole('dialog', { name: 'New scenario' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'From a template' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Blank slate' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Duplicate' })).toBeVisible();

  // The template search narrows as you type — base-nova's Combobox, not cmdk. Its popup is
  // portalled to the body, so it is located on the page rather than inside the dialog.
  await dialog.getByRole('combobox', { name: 'Search templates' }).fill('Bless');
  await expect(page.getByRole('option')).toHaveCount(1);
});

test('the generated form renders a control per declared param', async ({ page }) => {
  await page.goto('/scenarios/new?template=melee-attack');

  // All six param types are represented across the starter templates; melee-attack declares
  // five of them, `rerollDie` being the `rollChoice` the spec's five-type list omits.
  for (const param of ['attacker', 'target', 'weapon', 'rangeFt', 'useInspiration', 'rerollDie']) {
    await expect(page.getByLabel(param, { exact: true })).toBeVisible();
  }
});

/**
 * The one assertion that can only pass if the engine ran client-side: change a param and watch
 * the preview follow, with no navigation and no form submission.
 */
test('the preview re-renders in the browser when a param changes', async ({ page }) => {
  await page.goto('/scenarios/new?template=melee-attack');

  const preview = page.locator('pre').first();
  await expect(preview).toContainText('"schemaVersion": 3');
  await expect(preview).toContainText('"rangeFt": 5');

  await page.getByLabel('rangeFt', { exact: true }).fill('25');
  await expect(preview).toContainText('"rangeFt": 25');
});

test('the blank slate is a valid situation in an editable JSON tab', async ({ page }) => {
  await page.goto('/scenarios/new');
  await page.getByRole('tab', { name: 'JSON' }).click();

  const editor = page.getByLabel('Situation JSON');
  await expect(editor).toBeVisible();
  await expect(page.getByText('Valid against the situation schema.')).toBeVisible();

  // Breaking the JSON reports inline rather than on save.
  await editor.fill('{ not json');
  await expect(page.getByText('Valid against the situation schema.')).toHaveCount(0);
});

/** The two tabs share one source of truth: a form edit is written back into the JSON. */
test('an edit in the form view shows up in the JSON tab', async ({ page }) => {
  await page.goto('/scenarios/new');

  await page.getByLabel('Name', { exact: true }).first().fill('Keep the name field distinct');
  await page.locator('#actor-name').fill('Brave goblin');
  await page.getByRole('tab', { name: 'JSON' }).click();

  await expect(page.getByLabel('Situation JSON')).toHaveValue(/"name": "Brave goblin"/);
});

test('the slug follows the name until it is edited', async ({ page }) => {
  await page.goto('/scenarios/new');

  await page.getByLabel('Name', { exact: true }).fill('My melee test');
  await expect(page.getByLabel('Slug', { exact: true })).toHaveValue('my-melee-test');
});
