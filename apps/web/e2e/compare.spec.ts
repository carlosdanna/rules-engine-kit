import { expect, test } from '@playwright/test';

/**
 * `/compare`, `/profiles` and the ruleset Diff tab (FR-16, VR-9, ADR-0031).
 *
 * Read-only: saving and deleting a profile are covered by `lib/profiles/write.test.ts`
 * against an in-memory database, and `flows.spec.ts` reaches `/compare` from a scenario it
 * created.
 */

test('/compare defaults to SRD 5.1 against SRD 5.2.1, with both sides and a summary', async ({
  page,
}) => {
  await page.goto('/compare');

  await expect(page.getByRole('heading', { name: 'Compare', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Profile A' })).toHaveText(/srd-5\.1(?![.\d])/);
  await expect(page.getByRole('combobox', { name: 'Profile B' })).toHaveText(/srd-5\.2\.1/);
  await expect(page.getByTestId('diff-summary')).toBeVisible();
  await expect(page.getByTestId('compare-side-A')).toBeVisible();
  await expect(page.getByTestId('compare-side-B')).toBeVisible();
});

test('/compare is a function of its URL', async ({ page }) => {
  await page.goto('/compare?scenario=melee-attack&a=srd-5.2.1&b=srd-5.2.1&seed=same');

  // One profile on both sides cannot differ, whatever the scenario rolls.
  await expect(page.getByTestId('diff-summary')).toContainText('none');
  await expect(page.locator('[data-differs]')).toHaveCount(0);
});

test('/profiles lists the seeded profiles and previews a stack without saving it', async ({
  page,
}) => {
  await page.goto('/profiles');

  await expect(page.getByRole('heading', { name: 'Profiles', exact: true })).toBeVisible();
  await expect(
    page.getByTestId('profile-card').filter({ hasText: 'srd-5.2.1+flanking' }),
  ).toBeVisible();

  // The builder starts from the first base version and resolves it.
  await expect(page.getByTestId('stack-item')).toHaveCount(1);
  await expect(
    page.getByRole('region', { name: 'Resolution' }).getByTestId('resolved-hash'),
  ).toContainText('sha256:');

  // A layer alone, with the base removed, is not a stack at all.
  await page.getByRole('button', { name: 'Add house-flanking@1.0.0' }).click();
  await page.getByRole('button', { name: /^Remove dnd5e-srd@/ }).click();
  await expect(page.getByTestId('incompatible')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled();
});

test('the ruleset Diff tab compares SRD 5.2.1 with SRD 5.1 by default', async ({ page }) => {
  await page.goto('/rulesets/dnd5e-srd/5.2.1?tab=diff');

  await expect(page.getByRole('combobox', { name: 'Compared against' })).toHaveText(
    /dnd5e-srd@5\.1\.0/,
  );
  // SRD 5.1's Surprise costs the first turn; SRD 5.2.1's costs Initiative — a new phase.
  await expect(page.getByTestId('diff-changed')).toContainText('combat.surprise');
});

test('the stack reorders from the keyboard, and a layer on top is incompatible', async ({
  page,
}) => {
  await page.goto('/profiles');
  await page.getByRole('button', { name: 'Add house-flanking@1.0.0' }).click();
  await expect(page.getByTestId('stack-item')).toHaveCount(2);
  await expect(page.getByTestId('incompatible')).toHaveCount(0);

  // dnd kit's keyboard sensor: Space lifts, an arrow moves, Space drops. Each step waits for
  // the announcement dnd kit makes for screen readers. The sensor starts listening for arrows
  // a tick after the lift, so an arrow sent at machine speed can land before it and is retried.
  const announced = page.locator('[id^="DndLiveRegion"]');
  await page.getByRole('button', { name: 'Reorder house-flanking@1.0.0' }).focus();
  await page.keyboard.press('Space');
  await expect(announced).toContainText('house-flanking@1.0.0');
  await expect(async () => {
    await page.keyboard.press('ArrowUp');
    await expect(announced).toContainText('over droppable area dnd5e-srd@5.1.0', {
      timeout: 250,
    });
  }).toPass();
  await page.keyboard.press('Space');
  await expect(announced).toContainText('dropped');

  await expect(page.getByTestId('stack-item').first()).toContainText('house-flanking@1.0.0');
  await expect(page.getByTestId('incompatible')).toContainText('is not a base');
});
