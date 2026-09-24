/**
 * The five acceptance scenarios of `docs/requirements.md`, as the home page offers them: one
 * saved scenario, two profiles and a seed each, which is exactly what `/compare` takes in its
 * query string (FR-16, ADR-0031). Nothing here runs anything; `acceptance.test.ts` runs every
 * row and checks the stated outcome, so the page cannot claim a result the engine does not give.
 *
 * The `expected` strings are the requirements table's, verbatim.
 */

export type AcceptanceRow = {
  id: string;
  title: string;
  scenario: string;
  a: string;
  b: string;
  seed: string;
  expected: { a: string; b: string };
};

/**
 * `/compare`'s own default. Only the weapon-mastery row depends on it — Sap applies on a hit,
 * and under this seed the longsword's d20 is a 17 on either edition — but one seed for every
 * row keeps the links honest about being a single, reproducible run.
 */
export const ACCEPTANCE_SEED = 'demo';

export const ACCEPTANCE: readonly AcceptanceRow[] = [
  {
    id: 'surprise',
    title: 'Surprised creature at combat start',
    scenario: 'combat-start',
    a: 'srd-5.1',
    b: 'srd-5.2.1',
    seed: ACCEPTANCE_SEED,
    expected: { a: 'Cannot act on its first turn', b: 'Acts; disadvantage on initiative' },
  },
  {
    id: 'inspiration',
    title: 'Spend inspiration on an attack',
    scenario: 'inspiration-on-an-attack',
    a: 'srd-5.1',
    b: 'srd-5.2.1',
    seed: ACCEPTANCE_SEED,
    expected: { a: 'Advantage', b: 'Reroll the d20' },
  },
  {
    id: 'use-an-object',
    title: '“Use an Object” action',
    scenario: 'use-an-object',
    a: 'srd-5.1',
    b: 'srd-5.2.1',
    seed: ACCEPTANCE_SEED,
    expected: { a: 'Use an Object', b: 'Utilize (same rule_key, new label)' },
  },
  {
    id: 'weapon-mastery',
    title: 'Attack with a weapon mastery property',
    scenario: 'melee-attack',
    a: 'srd-5.1',
    b: 'srd-5.2.1',
    seed: ACCEPTANCE_SEED,
    expected: { a: 'No effect', b: 'Mastery applies' },
  },
  {
    id: 'flanking',
    title: 'Melee vs prone + house flanking',
    scenario: 'prone-and-flanked',
    a: 'srd-5.1+flanking',
    b: 'srd-5.2.1+flanking',
    seed: ACCEPTANCE_SEED,
    expected: { a: 'Advantage, doesn’t double', b: 'Same, on either base' },
  },
];

export function compareHref(row: AcceptanceRow): string {
  const query = new URLSearchParams({ scenario: row.scenario, a: row.a, b: row.b, seed: row.seed });
  return `/compare?${query.toString()}`;
}
