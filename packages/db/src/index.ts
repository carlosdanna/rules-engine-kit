/**
 * Drizzle schema, migrations, seeds and the content loader. Depends on the
 * engine, never the reverse. Tables and scripts land in M3; the content loader
 * (`./content`) is here now, because `pnpm content:lint` needs it and the seeds
 * will read the same trees.
 */
import { ENGINE_VERSION } from '@rules-engine-kit/engine';

export * from './content';

/** Bumped when the stored schema changes in a way seeds have to migrate across. */
export const DB_SCHEMA_VERSION = '0.0.0';

/** Engine version the persisted evaluations in this database were produced with. */
export const SEEDED_ENGINE_VERSION = ENGINE_VERSION;
