#!/usr/bin/env tsx
/**
 * `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset [--hard]` (ADR-0004).
 *
 * One binary with a command argument, for the reason `packages/engine/cli.ts` is one file: the
 * three differ by two booleans, and three scripts would be three places to keep the flag
 * handling and the error printing the same.
 */

import { openDb } from '../client';
import { DEFAULT_DB_PATH } from '../paths';
import { migrateDatabase, runSeed } from '../seed';
import { parseDbArgs } from './args';

const USAGE = `pnpm db:migrate            apply the committed migrations
pnpm db:seed               migrate, then rebuild the seeded rows from content/ and scenarios/
pnpm db:reset              the same, without refusing a changed pack version (ADR-0027)
pnpm db:reset --hard       delete every row first, including the ones a user made

  The database is ${DEFAULT_DB_PATH}; DATABASE_URL overrides it.`;

function report(label: string, summary: Record<string, number>): void {
  const counts = Object.entries(summary)
    .map(([table, count]) => `${count} ${table}`)
    .join(', ');
  process.stdout.write(`${label}: ${counts}\n`);
}

function main(argv: readonly string[]): number {
  const command = parseDbArgs(argv);

  switch (command.kind) {
    case 'help':
      process.stdout.write(`${USAGE}\n`);
      return argv.length === 0 ? 1 : 0;
    case 'migrate': {
      const { db, sqlite, path } = openDb();
      try {
        migrateDatabase(db);
        process.stdout.write(`migrated ${path}\n`);
      } finally {
        sqlite.close();
      }
      return 0;
    }
    case 'seed':
      report('seeded', runSeed({ guardPublished: true }));
      return 0;
    case 'reset':
      report(
        command.hard ? 'reset --hard' : 'reset',
        runSeed({ guardPublished: false, hard: command.hard }),
      );
      return 0;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (thrown) {
  process.stderr.write(`${(thrown as Error).message}\n`);
  process.exitCode = 1;
}
