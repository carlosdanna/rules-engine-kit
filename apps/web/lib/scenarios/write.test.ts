/**
 * The app's first write path (FR-18, ADR-0029).
 *
 * Playwright runs against the real `data/app.db` with no isolation and `db:reset` does not
 * clean up a user row, so creating a scenario end-to-end in a browser test would leave
 * something behind. The create/edit/delete rules are therefore asserted here instead, against
 * an in-memory database, and the browser suite stays read-only.
 *
 * The rows are hand-built rather than loaded from `content/`: what is under test is the writer,
 * and a suite that also loaded the real content tree would fail for reasons that belong to
 * `packages/db`.
 */

import {
  type Db,
  type ScenarioInput,
  type ScenarioRow,
  scenarios,
  sources,
  templates,
} from '@rules-engine-kit/db';
import { blankSituation, type Fixture, SITUATION_SCHEMA_VERSION } from '@rules-engine-kit/engine';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryDb, type TestDb } from './test-db';
import {
  createUserScenario,
  deleteUserScenario,
  editorSeedFor,
  isEditable,
  SEEDED_IS_READ_ONLY,
  updateUserScenario,
} from './write';

/** One actor fixture and one weapon, scoped to one profile — enough for a template to render. */
const FIXTURES: Fixture[] = [
  {
    kind: 'actor',
    slug: 'fighter',
    rulesetScope: ['srd-5.1'],
    citation: { source: 'srd-5.1', section: 'test' },
    interpretation: null,
    data: {
      name: 'Fighter',
      abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 11, cha: 10 },
      proficiencyBonus: 2,
      ac: 16,
      hp: 28,
      resistances: [],
      vulnerabilities: [],
    },
  },
  {
    kind: 'actor',
    slug: 'goblin',
    rulesetScope: ['srd-5.1'],
    citation: { source: 'srd-5.1', section: 'test' },
    interpretation: null,
    data: {
      name: 'Goblin',
      abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      proficiencyBonus: 2,
      ac: 15,
      hp: 7,
      resistances: [],
      vulnerabilities: [],
    },
  },
  {
    kind: 'item',
    slug: 'longsword',
    rulesetScope: ['srd-5.1'],
    citation: { source: 'srd-5.1', section: 'test' },
    interpretation: null,
    data: {
      name: 'Longsword',
      damage: { dice: { count: 1, sides: 8 }, type: 'slashing' },
      properties: [],
      mastery: null,
    },
  },
];

const TEMPLATE = {
  id: 'melee',
  name: 'Melee attack',
  description: 'One creature swings at another.',
  tags: ['attack'],
  paramsSchema: {
    attacker: { type: 'fixture', kind: 'actor', default: 'fighter' },
    target: { type: 'fixture', kind: 'actor', default: 'goblin' },
    weapon: { type: 'fixture', kind: 'item', default: 'longsword' },
    rangeFt: { type: 'number', default: 5, min: 0 },
  },
  skeleton: {
    actors: [
      { fixture: '{{attacker}}', id: 'attacker' },
      { fixture: '{{target}}', id: 'target' },
    ],
    timeline: [
      {
        id: 'r1',
        round: 1,
        actorId: 'attacker',
        action: {
          type: 'attack',
          mode: 'melee',
          targetId: 'target',
          weapon: '{{weapon}}',
          rangeFt: '{{rangeFt}}',
        },
      },
    ],
    intents: {},
  },
  suggestedProfiles: ['srd-5.1'],
  schemaVersion: 2,
} as const;

const SOURCES = { template: null, fixtures: FIXTURES };
const WITH_TEMPLATE = { template: TEMPLATE as never, fixtures: FIXTURES };

const literalInput = (over: Partial<ScenarioInput> = {}): ScenarioInput => ({
  slug: 'mine',
  name: 'Mine',
  body: { kind: 'literal', situation: blankSituation() },
  ...over,
});

const templateInput = (params: Record<string, unknown> = {}): ScenarioInput => ({
  slug: 'from-template',
  name: 'From a template',
  body: { kind: 'template', templateId: 'melee', profile: 'srd-5.1', params },
});

let test: TestDb;
let db: Db;

/** A row the test expects to exist: a missing one is a failed assertion, not a crash later. */
function only(rows: ScenarioRow[], where: (row: ScenarioRow) => boolean = () => true): ScenarioRow {
  const row = rows.find(where);
  expect(row).toBeDefined();
  if (row === undefined) throw new Error('unreachable');
  return row;
}

/** A seeded scenario to collide with, and the template row a save renders from. */
function givenSeededRows(): void {
  db.insert(sources)
    .values({
      id: 'srd@1',
      name: 'SRD',
      author: 'test',
      url: 'https://example.invalid',
      license: 'CC-BY-4.0',
      attributionText: 'test',
    })
    .run();
  db.insert(templates)
    .values(TEMPLATE as never)
    .run();
  db.insert(scenarios)
    .values({
      id: 'melee-attack',
      name: 'Melee attack',
      situation: blankSituation(),
      templateId: 'melee',
      params: {},
      origin: 'seed',
      schemaVersion: SITUATION_SCHEMA_VERSION,
    })
    .run();
}

beforeEach(() => {
  test = memoryDb();
  db = test.db;
});
afterEach(() => test.close());

describe('createUserScenario', () => {
  it('writes a user row from a literal situation', () => {
    const result = createUserScenario(db, literalInput(), SOURCES);
    expect(result.ok).toBe(true);

    const [row] = db.select().from(scenarios).all();
    expect(row).toMatchObject({
      id: 'mine',
      name: 'Mine',
      origin: 'user',
      templateId: null,
      params: null,
      schemaVersion: SITUATION_SCHEMA_VERSION,
    });
  });

  it('stores template_id and params so the copy stays re-renderable', () => {
    givenSeededRows();
    const result = createUserScenario(db, templateInput({ rangeFt: 10 }), WITH_TEMPLATE);
    expect(result.ok).toBe(true);

    const row = db.select().from(scenarios).where(eq(scenarios.id, 'from-template')).all()[0];
    expect(row?.templateId).toBe('melee');
    expect(row?.params).toEqual({ rangeFt: 10 });
    // Rendered server-side from the stored template, not taken from the client.
    expect(row?.situation.actors.map((actor) => actor.name)).toEqual(['Fighter', 'Goblin']);
  });

  it('refuses a slug a seeded row already holds, and suggests a free one', () => {
    givenSeededRows();
    const result = createUserScenario(db, literalInput({ slug: 'melee-attack' }), SOURCES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(String(result.fieldErrors.slug)).toContain('melee-attack-2');
    expect(db.select().from(scenarios).all()).toHaveLength(1);
  });

  /** No coercion anywhere in `resolveParams`, so a form that sent a string must be told. */
  it('rejects a string where the template declares a number', () => {
    givenSeededRows();
    const result = createUserScenario(db, templateInput({ rangeFt: '10' }), WITH_TEMPLATE);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors['params.rangeFt']).toBeDefined();
    expect(db.select().from(scenarios).all()).toHaveLength(1);
  });

  it('rejects a number below its declared minimum', () => {
    givenSeededRows();
    const result = createUserScenario(db, templateInput({ rangeFt: -1 }), WITH_TEMPLATE);
    expect(result.ok).toBe(false);
  });

  it('reports a param the template does not declare, and writes nothing', () => {
    givenSeededRows();
    const result = createUserScenario(db, templateInput({ nope: 1 }), WITH_TEMPLATE);

    expect(result.ok).toBe(false);
    expect(db.select().from(scenarios).all()).toHaveLength(1);
  });
});

describe('updateUserScenario', () => {
  it('changes a user row in place', () => {
    createUserScenario(db, literalInput(), SOURCES);
    const result = updateUserScenario(db, 'mine', literalInput({ name: 'Renamed' }), SOURCES);

    expect(result.ok).toBe(true);
    expect(db.select().from(scenarios).all()[0]?.name).toBe('Renamed');
  });

  it('refuses a seeded row and leaves it untouched', () => {
    givenSeededRows();
    const result = updateUserScenario(
      db,
      'melee-attack',
      literalInput({ name: 'Hijacked' }),
      SOURCES,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.formErrors[0]).toBe(SEEDED_IS_READ_ONLY);
    expect(db.select().from(scenarios).all()[0]?.name).toBe('Melee attack');
  });
});

describe('deleteUserScenario', () => {
  it('removes a user row', () => {
    createUserScenario(db, literalInput(), SOURCES);
    expect(deleteUserScenario(db, 'mine').ok).toBe(true);
    expect(db.select().from(scenarios).all()).toHaveLength(0);
  });

  it('refuses a seeded row', () => {
    givenSeededRows();
    expect(deleteUserScenario(db, 'melee-attack').ok).toBe(false);
    expect(db.select().from(scenarios).all()).toHaveLength(1);
  });

  it('reports a slug that names nothing', () => {
    expect(deleteUserScenario(db, 'ghost').ok).toBe(false);
  });
});

describe('editorSeedFor', () => {
  it('reopens a template-backed row in the template form', () => {
    givenSeededRows();
    expect(editorSeedFor(only(db.select().from(scenarios).all()), TEMPLATE as never)).toMatchObject(
      {
        mode: 'template',
        templateId: 'melee',
        drifted: false,
      },
    );
  });

  it('degrades to the stored situation when the template no longer declares a stored param', () => {
    givenSeededRows();
    db.update(scenarios)
      .set({ params: { gone: 1 } })
      .where(eq(scenarios.id, 'melee-attack'))
      .run();
    const seed = editorSeedFor(only(db.select().from(scenarios).all()), TEMPLATE as never);
    expect(seed.mode).toBe('literal');
    if (seed.mode === 'literal') expect(seed.drifted).toBe(true);
  });

  it('uses the stored situation when there is no template behind the row', () => {
    createUserScenario(db, literalInput(), SOURCES);
    expect(editorSeedFor(only(db.select().from(scenarios).all()), null)).toMatchObject({
      mode: 'literal',
      drifted: false,
    });
  });
});

describe('isEditable', () => {
  it('is false for a seeded row and true for a current user row', () => {
    givenSeededRows();
    createUserScenario(db, literalInput(), SOURCES);
    const rows = db.select().from(scenarios).all();

    expect(isEditable(only(rows, (row) => row.origin === 'seed'))).toBe(false);
    expect(isEditable(only(rows, (row) => row.origin === 'user'))).toBe(true);
  });

  /** A row written under a superseded schema cannot be parsed, so it cannot be edited (VR-8). */
  it('is false for a row stored under a superseded schema version', () => {
    createUserScenario(db, literalInput(), SOURCES);
    db.update(scenarios)
      .set({ schemaVersion: SITUATION_SCHEMA_VERSION - 1 })
      .run();
    expect(isEditable(only(db.select().from(scenarios).all()))).toBe(false);
  });
});
