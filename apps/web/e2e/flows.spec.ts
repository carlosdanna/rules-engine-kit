import { expect, type Page, test } from '@playwright/test';

/**
 * The two end-to-end flows the demo is for, writing rows as a user would (FR-18, VR-7, FR-16).
 *
 * These write, so they need the database `playwright.config.ts` gives the suite: its own
 * `data/e2e.db`, rebuilt with `db:reset --hard` before the server starts. Names carry a
 * timestamp so a reused server (`reuseExistingServer` outside CI) never sees a slug twice.
 */

const stamp = () => `${Date.now().toString(36)}-${test.info().workerIndex}`;

async function saveScenario(page: Page, name: string): Promise<string> {
  await page.getByLabel('Name', { exact: true }).fill(name);
  const slug = await page.getByLabel('Slug', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Save scenario' }).click();
  await expect(page).toHaveURL(new RegExp(`/scenarios/${slug}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  return slug;
}

/** From a saved scenario's page to its stored evaluation; returns the evaluation's path. */
async function runInPlayground(page: Page, slug: string): Promise<string> {
  await page.getByRole('link', { name: 'Open in playground' }).click();
  await expect(page).toHaveURL(new RegExp(`/playground\\?scenario=${slug}$`));

  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const stored = page.getByRole('link', { name: /^\/evaluations\// });
  await expect(stored).toBeVisible();
  await expect(page.getByTestId('outcome-summary')).toBeVisible();

  const href = (await stored.getAttribute('href')) ?? '';
  await stored.click();
  await expect(page).toHaveURL(href);
  await expect(page.getByRole('heading', { name: 'Stored evaluation' })).toBeVisible();
  await expect(page.getByTestId('outcome-summary')).toBeVisible();
  return href;
}

test('create from a template, run it, then compare it under both editions', async ({ page }) => {
  const name = `E2E melee ${stamp()}`;

  await page.goto('/scenarios/new?template=melee-attack');
  await page.getByLabel('useInspiration', { exact: true }).click();
  const slug = await saveScenario(page, name);

  const evaluation = await runInPlayground(page, slug);
  await expect(page.getByText('demo', { exact: true }).first()).toBeVisible();
  expect(evaluation).toMatch(/^\/evaluations\/[0-9a-f-]{36}$/);

  // Into /compare through its own form rather than a hand-built URL.
  await page.goto('/compare');
  await page.getByRole('combobox', { name: 'Scenario' }).click();
  await page.getByRole('option', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`scenario=${slug}&a=srd-5\\.1&b=srd-5\\.2\\.1`));
  await expect(page.getByTestId('compare-side-A')).toBeVisible();
  await expect(page.getByTestId('compare-side-B')).toBeVisible();
  // Inspiration is advantage under 5.1 and a reroll under 5.2.1, so the sides always differ.
  await expect(page.getByTestId('differing-values')).toBeVisible();
  await expect(page.locator('[data-differs]').first()).toBeVisible();
});

test('start from a blank slate, then run it', async ({ page }) => {
  const name = `E2E blank ${stamp()}`;

  await page.goto('/scenarios/new');
  await expect(page.getByRole('tab', { name: 'JSON' })).toBeVisible();
  const slug = await saveScenario(page, name);

  await runInPlayground(page, slug);
});
