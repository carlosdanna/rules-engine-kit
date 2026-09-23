/**
 * Reseeding twice yields identical rows.
 *
 * The property ADR-0027's deterministic ids exist for, asserted the blunt way: dump every
 * table after one seed and after two, and compare. It catches a counter used as a key, a
 * clock in a column, a set iterated in hash order and a row written twice — none of which a
 * per-table assertion would notice.
 */

import { describe, expect, it } from 'vitest';
import { seedDatabase } from '../../src/seed';
import { dumpAll, openTestDb, seedContent } from './helpers';

describe('seeding is idempotent (ADR-0004, ADR-0027)', () => {
  it('writes identical rows the second time', () => {
    const database = openTestDb();
    try {
      seedDatabase(database.db, seedContent());
      const first = dumpAll(database.sqlite);

      seedDatabase(database.db, seedContent());
      const second = dumpAll(database.sqlite);

      expect(second).toEqual(first);
    } finally {
      database.close();
    }
  });

  it('gives two fresh databases the same rows, so a seed does not depend on its history', () => {
    const one = openTestDb();
    const two = openTestDb();
    try {
      seedDatabase(one.db, seedContent());
      seedDatabase(two.db, seedContent());
      expect(dumpAll(two.sqlite)).toEqual(dumpAll(one.sqlite));
    } finally {
      one.close();
      two.close();
    }
  });

  it('seeds every table the data model lists', () => {
    const database = openTestDb();
    try {
      const summary = seedDatabase(database.db, seedContent());
      // `evaluations` is the one table a seed never writes: nothing in content/ is a run.
      for (const [table, count] of Object.entries(summary)) {
        expect(count, `${table} seeded no rows`).toBeGreaterThan(0);
      }
    } finally {
      database.close();
    }
  });
});
