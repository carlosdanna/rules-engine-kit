import { expect, test } from '@playwright/test';

/**
 * Every browse route renders, with real seeded content on it.
 *
 * Each case asserts something that only exists if the database was read — a rule key, a
 * template name, an attribution line. A test that only checked the heading would pass against
 * an empty database, which is the failure this suite is here to catch.
 */

const routes = [
  { path: '/', heading: 'Rules Engine Kit', evidence: 'versioned rules engine' },
  { path: '/rulesets', heading: 'Rulesets', evidence: 'dnd5e-srd@5.1.0' },
  { path: '/templates', heading: 'Templates', evidence: 'Melee attack' },
  { path: '/credits', heading: 'Credits', evidence: 'Wizards of the Coast LLC' },
  {
    path: '/rulesets/dnd5e-srd/5.1.0',
    heading: 'SRD 5.1',
    evidence: 'condition.prone.attacked',
  },
  {
    path: '/rulesets/dnd5e-srd/5.2.1',
    heading: 'SRD 5.2.1',
    evidence: 'weapon.mastery.sap',
  },
  {
    path: '/rulesets/house-flanking/1.0.0',
    heading: 'House rule — Flanking',
    evidence: 'house.flanking',
  },
] as const;

for (const route of routes) {
  test(`${route.path} renders`, async ({ page }) => {
    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);
    await expect(page.getByText(route.evidence).first()).toBeVisible();
  });
}

test('an unknown ruleset version is a 404', async ({ page }) => {
  const response = await page.goto('/rulesets/dnd5e-srd/9.9.9');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No such ruleset version');
});

test('the rule sheet opens from the URL and shows the detail', async ({ page }) => {
  await page.goto('/rulesets/house-flanking/1.0.0?rule=house.flanking');

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('House rules > Flanking')).toBeVisible();
  // The layer section is what the route promises over a flat rule list.
  await expect(sheet.getByText('srd-5.1+flanking')).toBeVisible();
});

test('the rule sheet opens from a row and closes again', async ({ page }) => {
  await page.goto('/rulesets/dnd5e-srd/5.1.0');
  await page.getByRole('link', { name: 'condition.prone.attacked', exact: true }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/rule=condition\.prone\.attacked/);

  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
});

test('the phase filter narrows the table', async ({ page }) => {
  await page.goto('/rulesets/dnd5e-srd/5.2.1');
  await expect(page.getByText('40 of 40 rules')).toBeVisible();

  // 7 of this edition's rules sit in `damage`; the other 7 of the 14 across both editions
  // belong to SRD 5.1.
  await page.getByRole('button', { name: /^damage/ }).click();
  await expect(page.getByText('7 of 40 rules')).toBeVisible();
});

test('the search narrows the table', async ({ page }) => {
  await page.goto('/rulesets/dnd5e-srd/5.2.1');
  await page.getByLabel('Search rules').fill('sap');
  await expect(page.getByText('3 of 40 rules')).toBeVisible();
});

test('a template sheet resolves its fixtures per profile', async ({ page }) => {
  await page.goto('/templates?template=melee-attack');

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('cell', { name: 'attacker', exact: true })).toBeVisible();
  await expect(sheet.getByText('fighter-3').first()).toBeVisible();
  // The goblin resolves to a different stat block per edition — the point of scoping.
  const goblin = sheet.locator('article').filter({ hasText: 'target' }).first();
  await expect(goblin.getByText('srd-5.1', { exact: true })).toBeVisible();
  await expect(goblin.getByText('srd-5.2.1', { exact: true })).toBeVisible();
});
