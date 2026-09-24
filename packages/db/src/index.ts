/**
 * Drizzle schema, migrations, seeds and the content loader. Depends on the engine, never the
 * reverse (M3).
 *
 * `./schema` is the tables, `./seed` is what fills them from `content/` and `scenarios/`, and
 * `./content` is the loader both the seeds and `pnpm content:lint` read trees with. `./client`
 * is the only place the database is opened, because the pragmas the seeded/user split depends
 * on are not SQLite's defaults.
 */
import { ENGINE_VERSION } from '@rules-engine-kit/engine';

export { type Db, openDb } from './client';
export * from './content';
export { CONTENT_DIR, DEFAULT_DB_PATH, MIGRATIONS_DIR, REPO_ROOT, SCENARIOS_DIR } from './paths';
export {
  type LoadedResolvedProfile,
  loadResolvedProfile,
  rulesetVersionFromRows,
  StaleProfileError,
} from './profile';
export * from './schema';
export * from './seed';
export { isValidSlug, slugify, uniqueSlug } from './slug';

/** Bumped when the stored schema changes in a way seeds have to migrate across. */
export const DB_SCHEMA_VERSION = '0.0.0';

/** Engine version the persisted evaluations in this database were produced with. */
export const SEEDED_ENGINE_VERSION = ENGINE_VERSION;
