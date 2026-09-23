/**
 * Opening the database, in one place.
 *
 * The pragmas are the reason this is a function rather than two lines at each call site:
 * `foreign_keys` is **off** by default in SQLite, and the seeded/user split (ADR-0004) leans on
 * it — a user evaluation pointing at a scenario that no longer exists is exactly the state
 * `db:reset` must not be able to produce. WAL is for the app, which reads while a seed writes.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { DEFAULT_DB_PATH } from './paths';
import * as schema from './schema';

export type Db = ReturnType<typeof openDb>['db'];

export function openDb(path: string = DEFAULT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  return { db: drizzle(sqlite, { schema }), sqlite, path };
}
