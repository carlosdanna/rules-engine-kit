import 'server-only';

/**
 * The one database handle the app reads through (CLAUDE.md: DB access only in server code).
 *
 * `openDb` opens a fresh `better-sqlite3` handle on every call and never closes one, so a
 * module-level call would leak a file descriptor per `next dev` recompile. The handle is
 * therefore cached on `globalThis`, which survives HMR where a module binding does not.
 *
 * The path is resolved here rather than taken from the db package's `DEFAULT_DB_PATH`:
 * that constant derives from `import.meta.url`, and `next.config.ts` bundles
 * `@rules-engine-kit/db` through `transpilePackages`, so its idea of the repository root is
 * wherever the emitted chunk landed. `next` runs with the app directory as its cwd, so two
 * levels up is the repository root whether the command is `dev`, `build` or `start`.
 */

import { join, resolve } from 'node:path';
import { type Db, openDb } from '@rules-engine-kit/db';

export function repoRoot(): string {
  return resolve(process.cwd(), '..', '..');
}

/** `DATABASE_URL` is a bare filesystem path here, as it is for `pnpm db:seed`. */
function databasePath(): string {
  return process.env.DATABASE_URL ?? join(repoRoot(), 'data', 'app.db');
}

const cache = globalThis as typeof globalThis & { __rekDb?: Db };

export function getDb(): Db {
  cache.__rekDb ??= openDb(databasePath()).db;
  return cache.__rekDb;
}
