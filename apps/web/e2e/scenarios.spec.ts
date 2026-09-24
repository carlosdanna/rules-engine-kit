import { expect, test } from '@playwright/test';

/**
 * `/scenarios` and `/scenarios/new`, without writing anything (FR-18, FR-19).
 *
 * This suite is read-only. Creating a scenario end to end is `flows.spec.ts`'s job, against
 * the suite's own `data/e2e.db` (see `playwright.config.ts`); the create, edit and delete
 * rules themselves are asserted in `apps/web/lib/scenarios/write.test.ts`, against an
 * in-memory database.
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
  // Nine seeded rows, and none of them offers an edit or a delete. Scoped to those rows:
  // `flows.spec.ts` runs alongside and may already have added user rows, which offer both.
  const seeded = page.getByRole('row').filter({ has: page.getByText('seed', { exact: true }) });
  await expect(seeded).toHaveCount(9);
  await expect(seeded.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(seeded.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
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
  await page.getByLabel('Actor 1 name').fill('Brave goblin');
  await page.getByRole('tab', { name: 'JSON' }).click();

  await expect(page.getByLabel('Situation JSON')).toHaveValue(/"name": "Brave goblin"/);
});

test('the slug follows the name until it is edited', async ({ page }) => {
  await page.goto('/scenarios/new');

  await page.getByLabel('Name', { exact: true }).fill('My melee test');
  await expect(page.getByLabel('Slug', { exact: true })).toHaveValue('my-melee-test');
});

/** The guided blank slate: stat blocks copied in under the chosen profile, first one attacking. */
test('the guided blank slate starts from the picked actor fixtures', async ({ page }) => {
  await page.goto('/scenarios/new?profile=srd-5.1&actors=fighter-3,goblin&action=attack');

  await expect(page.getByLabel('Actor 1 name')).toHaveValue('Fighter (3rd level)');
  await expect(page.getByLabel('Actor 2 name')).toHaveValue('Goblin');
  await expect(page.getByLabel('Step 1 action')).toContainText('Attack');
  await expect(page.getByLabel('Step 1 target')).toContainText('Goblin');
  await expect(page.getByLabel('Step 2 action')).toContainText('No action');

  // The SRD 5.1 goblin, not the 5.2.1 one: the profile picked which variant was inlined.
  await page.getByRole('tab', { name: 'JSON' }).click();
  await expect(page.getByLabel('Situation JSON')).toHaveValue(/"hp": 7,/);
});

test('the dialog’s blank slate carries its picks into the editor', async ({ page }) => {
  await page.goto('/scenarios');
  await page.getByRole('button', { name: 'New scenario' }).click();
  const dialog = page.getByRole('dialog', { name: 'New scenario' });
  await dialog.getByRole('tab', { name: 'Blank slate' }).click();

  const actors = dialog.getByRole('combobox', { name: 'Actors' });
  for (const name of ['Fighter (3rd level)', 'Goblin']) {
    await actors.fill(name);
    await page
      .getByRole('option', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) })
      .click();
  }
  await dialog.getByRole('button', { name: 'Start from blank' }).click();

  await expect(page).toHaveURL(/actors=fighter-3%2Cgoblin&action=attack$/);
  await expect(page.getByLabel('Step 1 target')).toContainText('Goblin');
});

test('a starter naming a stat block the profile does not have is a 404', async ({ page }) => {
  const response = await page.goto('/scenarios/new?profile=srd-5.1&actors=no-such-creature');
  expect(response?.status()).toBe(404);
});

test('customizing a template scenario detaches it into the full form', async ({ page }) => {
  await page.goto('/scenarios/new?template=melee-attack');

  await page.getByRole('button', { name: 'Customize further' }).click();
  await page.getByRole('button', { name: 'Detach and customize' }).click();

  await expect(page.getByText('Detached from “Melee attack”')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Form', selected: true })).toBeVisible();
  // The rendered situation is what is now being edited: both actors and the inlined weapon.
  await expect(page.getByLabel('Actor 2 name')).toHaveValue('Goblin');
  await expect(page.getByLabel('Step 1 weapon')).toContainText('Longsword');

  await page.getByRole('button', { name: 'Add blank actor' }).click();
  await expect(page.getByLabel('Actor 3 name')).toHaveValue('Actor 3');
});
