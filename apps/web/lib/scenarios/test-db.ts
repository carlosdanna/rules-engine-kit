/**
 * An in-memory database for the write tests.
 *
 * Deliberately not `*.test.ts`, so Vitest does not collect it as a suite, and deliberately not
 * `getDb()`: that handle points at `data/app.db`, which `pnpm dev` and Playwright both use.
 * Every test in this directory goes through here, which is what makes "the tests never touch
 * the real database" a property of the code rather than a rule to remember.
 *
 * `openDb` skips its `mkdirSync` for `:memory:` and still applies `foreign_keys = ON`, so the
 * references a scenario row makes are enforced here exactly as they are in the app.
 */

import { type Db, migrateDatabase, openDb } from '@rules-engine-kit/db';

export type TestDb = { db: Db; close: () => void };

export function memoryDb(): TestDb {
  const opened = openDb(':memory:');
  migrateDatabase(opened.db);
  return { db: opened.db, close: () => opened.sqlite.close() };
}
