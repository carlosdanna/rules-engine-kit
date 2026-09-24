/**
 * Building, saving and deleting a user profile (ADR-0031), against an in-memory database
 * seeded from the real `content/`.
 */

import {
  evaluations,
  loadSeedContent,
  profileLayers,
  profiles,
  seedDatabase,
} from '@rules-engine-kit/db';
import { ENGINE_VERSION, TRACE_SCHEMA_VERSION } from '@rules-engine-kit/engine';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryDb, type TestDb } from '../scenarios/test-db';
import { createUserProfile, deleteUserProfile, previewProfile } from './write';

const FLANKED = ['dnd5e-srd@5.2.1', 'house-flanking@1.0.0'];

let database: TestDb;

beforeEach(() => {
  database = memoryDb();
  seedDatabase(database.db, loadSeedContent());
});

afterEach(() => database.close());

const seededHash = (id: string) =>
  database.db.select().from(profiles).where(eq(profiles.id, id)).all()[0]?.resolvedHash;

describe('previewProfile', () => {
  it('resolves a stack to the hash the same seeded stack has', () => {
    const result = previewProfile(database.db, FLANKED);
    expect(result).toMatchObject({
      ok: true,
      data: { status: 'resolved', hash: seededHash('srd-5.2.1+flanking') },
    });
  });

  it('reports an incompatible stack with its reason, rather than failing', () => {
    const result = previewProfile(database.db, [...FLANKED].reverse());
    expect(result).toMatchObject({
      ok: true,
      data: { status: 'incompatible', reason: { kind: 'base-not-first' } },
    });
  });

  it('reports an empty stack as incompatible', () => {
    expect(previewProfile(database.db, [])).toMatchObject({
      ok: true,
      data: { status: 'incompatible', reason: { kind: 'empty-stack' } },
    });
  });

  it('fails on a version id with no row', () => {
    expect(previewProfile(database.db, ['dnd5e-srd@9.9.9'])).toMatchObject({ ok: false });
  });
});

describe('createUserProfile', () => {
  it('stores the profile, its hash and its layers in order, as a user row', () => {
    const result = createUserProfile(database.db, {
      name: 'My table',
      slug: 'my-table',
      versionIds: FLANKED,
    });
    expect(result).toEqual({ ok: true, data: { slug: 'my-table' } });

    expect(database.db.select().from(profiles).where(eq(profiles.id, 'my-table')).all()).toEqual([
      {
        id: 'my-table',
        name: 'My table',
        resolvedHash: seededHash('srd-5.2.1+flanking'),
        origin: 'user',
      },
    ]);
    const layers = database.db
      .select()
      .from(profileLayers)
      .where(eq(profileLayers.profileId, 'my-table'))
      .orderBy(asc(profileLayers.position))
      .all();
    expect(layers.map((layer) => layer.rulesetVersionId)).toEqual(FLANKED);
  });

  it('refuses an incompatible stack and writes nothing', () => {
    const result = createUserProfile(database.db, {
      name: 'Backwards',
      slug: 'backwards',
      versionIds: [...FLANKED].reverse(),
    });
    expect(result).toMatchObject({ ok: false, fieldErrors: { layers: expect.any(String) } });
    expect(database.db.select().from(profiles).where(eq(profiles.id, 'backwards')).all()).toEqual(
      [],
    );
  });

  it('refuses a slug already taken, suggesting the next free one', () => {
    createUserProfile(database.db, { name: 'Mine', slug: 'mine', versionIds: FLANKED });
    const again = createUserProfile(database.db, {
      name: 'Mine',
      slug: 'mine',
      versionIds: FLANKED,
    });
    expect(again).toMatchObject({
      ok: false,
      fieldErrors: { slug: expect.stringMatching(/mine-2/) },
    });
  });

  it('refuses a slug that is not slug-shaped, and a blank name', () => {
    const result = createUserProfile(database.db, {
      name: '  ',
      slug: 'Not A Slug',
      versionIds: FLANKED,
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String), slug: expect.any(String) },
    });
  });
});

describe('deleteUserProfile', () => {
  it('deletes a user profile and its layers', () => {
    createUserProfile(database.db, { name: 'Mine', slug: 'mine', versionIds: FLANKED });
    expect(deleteUserProfile(database.db, 'mine')).toEqual({ ok: true, data: null });
    expect(database.db.select().from(profiles).where(eq(profiles.id, 'mine')).all()).toEqual([]);
    expect(
      database.db.select().from(profileLayers).where(eq(profileLayers.profileId, 'mine')).all(),
    ).toEqual([]);
  });

  it('refuses a seeded profile', () => {
    expect(deleteUserProfile(database.db, 'srd-5.1')).toMatchObject({
      ok: false,
      formErrors: [expect.stringMatching(/profiles\.yaml/)],
    });
  });

  it('refuses a profile with stored runs, naming how many', () => {
    createUserProfile(database.db, { name: 'Mine', slug: 'mine', versionIds: FLANKED });
    const situation = loadSeedContent().scenarios[0]?.situation;
    if (situation === undefined) throw new Error('no seeded scenario');
    database.db
      .insert(evaluations)
      .values({
        id: 'run-1',
        scenarioId: 'melee-attack',
        profileId: 'mine',
        profileHash: 'sha256:x',
        seed: 's',
        engineVersion: ENGINE_VERSION,
        traceSchemaVersion: TRACE_SCHEMA_VERSION,
        situation,
        outcome: {
          steps: [],
          finalState: { actors: {}, activeEffects: [] },
          derived: [],
          events: [],
          seed: 's',
          profileHash: 'sha256:x',
          engineVersion: ENGINE_VERSION,
          traceSchemaVersion: TRACE_SCHEMA_VERSION,
        },
        trace: { traceSchemaVersion: TRACE_SCHEMA_VERSION, events: [] },
      })
      .run();

    expect(deleteUserProfile(database.db, 'mine')).toMatchObject({
      ok: false,
      formErrors: [expect.stringMatching(/1 stored run/)],
    });
  });
});
