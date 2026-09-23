/**
 * A database per test, in a temp directory.
 *
 * The suites seed the repository's own `content/` and `scenarios/` rather than a fixture tree:
 * these tests are about what `pnpm db:seed` does to the real content, and a fixture tree would
 * pass while the thing the command actually seeds was broken.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../../src/client';
import { type LoadedContent, loadContentTree } from '../../src/content';
import { CONTENT_DIR, SCENARIOS_DIR } from '../../src/paths';
import { migrateDatabase } from '../../src/seed';

/** Loaded once: six templates rendered per suite would be six times the work for one answer. */
let cached: LoadedContent | undefined;

export function seedContent(): LoadedContent {
  cached ??= loadContentTree(CONTENT_DIR, SCENARIOS_DIR);
  return cached;
}

export type TestDb = ReturnType<typeof openTestDb>;

export function openTestDb() {
  const dir = mkdtempSync(join(tmpdir(), 'rules-engine-kit-db-'));
  const opened = openDb(join(dir, 'test.db'));
  migrateDatabase(opened.db);

  return {
    ...opened,
    close(): void {
      opened.sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Every table's rows, ordered, as plain values: what "identical rows" is compared over. */
export function dumpAll(sqlite: Database.Database): Record<string, unknown[]> {
  const tables = sqlite
    .prepare<[], { name: string }>(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name != '__drizzle_migrations' order by name",
    )
    .all()
    .map((row) => row.name);

  const dump: Record<string, unknown[]> = {};
  for (const table of tables) {
    // `order by` every column, so the comparison never depends on insertion order.
    const columns = sqlite
      .prepare<[], { name: string }>(`select name from pragma_table_info('${table}')`)
      .all()
      .map((row) => `"${row.name}"`)
      .join(', ');
    dump[table] = sqlite.prepare(`select * from "${table}" order by ${columns}`).all();
  }
  return dump;
}
