/**
 * A user scenario's primary key (ADR-0029).
 *
 * ADR-0027 makes the slug the row's identity, and `db:reset` re-inserts the six seeded slugs
 * on every run — so the namespace is shared and a user row that took `melee-attack` would
 * collide with content the next reset brings back. `uniqueSlug` is what keeps that from
 * happening, which is why it is tested against the real seeded slugs.
 */

import { describe, expect, it } from 'vitest';
import { isValidSlug, slugify, uniqueSlug } from '../src/slug';

/** The six in `scenarios/`, as `db:seed` writes them. */
const SEEDED = [
  'ability-check-vs-dc',
  'buffed-round',
  'combat-start',
  'melee-attack',
  'ranged-attack-with-cover',
  'saving-throw-vs-effect',
];

describe('slugify', () => {
  it.each([
    ['Melee attack', 'melee-attack'],
    ['  Trailing and leading  ', 'trailing-and-leading'],
    ['Combat start, with a surprised creature', 'combat-start-with-a-surprised-creature'],
    ['Bless — over three rounds', 'bless-over-three-rounds'],
    ['UPPER CASE', 'upper-case'],
    ['multiple   inner   spaces', 'multiple-inner-spaces'],
    ["an apostrophe's fate", 'an-apostrophes-fate'],
    ['5e compatible', '5e-compatible'],
    ['hyphen---collapse', 'hyphen-collapse'],
  ])('%j becomes %j', (name, expected) => {
    expect(slugify(name)).toBe(expected);
  });

  /** A name with nothing slug-shaped in it still has to yield a usable key. */
  it.each(['', '   ', '!!!', '???'])('falls back for %j', (name) => {
    expect(slugify(name)).toBe('scenario');
  });

  it('never returns something it would reject', () => {
    for (const name of ['Melee attack', '!!!', 'Bless — over three rounds', '']) {
      expect(isValidSlug(slugify(name))).toBe(true);
    }
  });
});

describe('uniqueSlug', () => {
  it('returns the base when nothing holds it', () => {
    expect(uniqueSlug('my-situation', SEEDED)).toBe('my-situation');
  });

  it('suffixes against a seeded slug rather than colliding with it', () => {
    expect(uniqueSlug('melee-attack', SEEDED)).toBe('melee-attack-2');
  });

  it('counts up past every suffix already taken', () => {
    const taken = ['melee-attack', 'melee-attack-2', 'melee-attack-3'];
    expect(uniqueSlug('melee-attack', taken)).toBe('melee-attack-4');
  });

  /** A gap is filled rather than skipped: the first free suffix wins. */
  it('takes a free suffix below an occupied one', () => {
    expect(uniqueSlug('melee-attack', ['melee-attack', 'melee-attack-3'])).toBe('melee-attack-2');
  });

  it('accepts any iterable of taken ids', () => {
    expect(uniqueSlug('melee-attack', new Set(SEEDED))).toBe('melee-attack-2');
  });
});
