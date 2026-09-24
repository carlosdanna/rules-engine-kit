/**
 * The mappings worth pinning down, asserted against the rows rather than against a database:
 * `rowsFromContent` is pure, so every decision M3 makes about what a row *means* is testable
 * without opening a file.
 */

import { type RuleEntry, resolveProfile } from '@rules-engine-kit/engine';
import { describe, expect, it } from 'vitest';
import { contentHashOf, rowsFromContent, ruleRow } from '../../src/seed';
import { seedContent } from './helpers';

const content = seedContent();
const rows = rowsFromContent(content);

describe('sources (NFR-6, ADR-0027)', () => {
  it('is one row per pack version, not per ruleset', () => {
    expect(rows.sources.map((row) => row.id).sort()).toEqual([
      'dnd5e-srd@5.1.0',
      'dnd5e-srd@5.2.1',
      'house-flanking@1.0.0',
    ]);
  });

  it('keeps the two SRD editions apart, which a source_id on rulesets could not', () => {
    const urls = rows.sources
      .filter((row) => row.id.startsWith('dnd5e-srd@'))
      .map((row) => row.url);
    expect(new Set(urls).size).toBe(2);
  });

  it('carries the author and the attribution /credits renders', () => {
    const srd = rows.sources.find((row) => row.id === 'dnd5e-srd@5.2.1');
    expect(srd?.author).toBe('Wizards of the Coast LLC');
    expect(srd?.attributionText).toContain('System Reference Document 5.2.1');
  });
});

describe('rulesets and their versions', () => {
  it('is one ruleset row per slug across versions', () => {
    expect(rows.rulesets.map((row) => row.id).sort()).toEqual(['dnd5e-srd', 'house-flanking']);
  });

  it("records the layer's declared base range rather than a single base version (VR-3)", () => {
    const layer = rows.rulesetVersions.find((row) => row.id === 'house-flanking@1.0.0');
    expect(layer).toMatchObject({ baseRulesetId: 'dnd5e-srd', baseRange: '>=5.1.0' });

    const base = rows.rulesetVersions.find((row) => row.id === 'dnd5e-srd@5.1.0');
    expect(base).toMatchObject({ baseRulesetId: null, baseRange: null });
  });

  it('hashes each version over its own canonical content (ADR-0027)', () => {
    for (const pack of content.packs) {
      const row = rows.rulesetVersions.find((candidate) => candidate.id.endsWith(pack.version));
      expect(row?.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
    const hashes = rows.rulesetVersions.map((row) => row.contentHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('is stable: the same content hashes to the same value twice', () => {
    const pack = content.packs[0];
    if (pack === undefined) throw new Error('no packs loaded');
    expect(contentHashOf(pack)).toBe(contentHashOf(pack));
  });
});

describe('rules (ADR-0009)', () => {
  it('gives an add a body and a disable only a reason', () => {
    const add = rows.rules.find((row) => row.op === 'add');
    expect(add?.phase).not.toBeNull();
    expect(add?.effects).toBeDefined();
    expect(add?.patch ?? null).toBeNull();
  });

  it('stores a patch as authored, so which fields it declared survives', () => {
    const patches = rows.rules.filter((row) => row.op === 'patch');
    for (const patch of patches) {
      expect(patch.patch).toMatchObject({ op: 'patch', key: patch.ruleKey });
      expect(patch.phase ?? null).toBeNull();
    }
  });

  it('keys a rule by its version and its key, so two editions of one key are two rows', () => {
    const prone = rows.rules.filter((row) => row.ruleKey === 'condition.prone.attacked');
    expect(prone.length).toBeGreaterThan(1);
    expect(new Set(prone.map((row) => row.id)).size).toBe(prone.length);
  });
});

describe('fixtures (ADR-0024, ADR-0026, ADR-0027)', () => {
  it('seeds both goblins, because a slug is not a key', () => {
    const goblins = rows.fixtures.filter((row) => row.slug === 'goblin');
    expect(goblins).toHaveLength(2);
    expect(goblins.map((row) => row.id).sort()).toEqual([
      'actor:goblin:srd-5.1',
      'actor:goblin:srd-5.2.1',
    ]);
  });

  it('attributes a fixture to the pack behind the profile its citation names', () => {
    const fighter = rows.fixtures.find((row) => row.slug === 'fighter-3');
    expect(fighter?.sourceId).toBe('dnd5e-srd@5.1.0');
  });

  it("keeps fighter-3's interpretation, which is why the field exists (ADR-0026)", () => {
    const fighter = rows.fixtures.find((row) => row.slug === 'fighter-3');
    expect(fighter?.interpretation).toContain('Derived, not printed');
  });
});

describe('templates (ADR-0028)', () => {
  it('seeds all six, with the description /templates lists', () => {
    expect(rows.templates).toHaveLength(6);
    for (const template of rows.templates) {
      expect(template.description.length).toBeGreaterThan(0);
      expect(template.schemaVersion).toBe(2);
    }
  });
});

describe('profiles (ADR-0009, ADR-0026)', () => {
  it('seeds the hash resolveProfile produces for the stack', () => {
    for (const profile of content.profiles) {
      const stack = profile.layers.map((layer) => {
        const pack = content.packs.find(
          (candidate) => candidate.id === layer.id && candidate.version === layer.version,
        );
        if (pack === undefined) throw new Error(`no pack for ${layer.id}@${layer.version}`);
        return pack;
      });
      const row = rows.profiles.find((candidate) => candidate.id === profile.slug);
      expect(row?.resolvedHash).toBe(resolveProfile(stack).hash);
    }
  });

  it('orders the layers base first (ADR-0018)', () => {
    const flanking = rows.profileLayers
      .filter((row) => row.profileId === 'srd-5.2.1+flanking')
      .sort((a, b) => a.position - b.position);
    expect(flanking.map((row) => row.rulesetVersionId)).toEqual([
      'dnd5e-srd@5.2.1',
      'house-flanking@1.0.0',
    ]);
  });

  it('marks every seeded profile as seeded (ADR-0004)', () => {
    expect(rows.profiles.every((row) => row.origin === 'seed')).toBe(true);
  });
});

describe('scenarios (ADR-0028)', () => {
  it('seeds every file in scenarios/, each template call recording what it was rendered from', () => {
    expect(rows.scenarios).toHaveLength(9);
    for (const scenario of rows.scenarios) {
      expect(scenario.origin).toBe('seed');
      // A literal situation has neither; a template call has both (ADR-0028).
      expect(scenario.params === null).toBe(scenario.templateId === null);
    }
    expect(rows.scenarios.filter((row) => row.templateId === null).map((row) => row.id)).toEqual([
      'use-an-object',
    ]);
  });

  it('stores the whole timeline, closed over its content (ADR-0017)', () => {
    const melee = rows.scenarios.find((row) => row.id === 'melee-attack');
    expect(melee?.situation.timeline).toHaveLength(1);
    expect(melee?.situation.items).toHaveProperty('longsword');
    expect(melee?.schemaVersion).toBe(melee?.situation.schemaVersion);
  });
});

/**
 * Every pack in `content/` declares its rules with `add` — the house-rule layer adds a rule
 * rather than editing one — so the other three ops have no coverage from the tree. They are
 * the ops the storage decision in `rows.ts` is actually *about* (ADR-0009), so they are
 * asserted directly rather than left until a layer happens to use one.
 */
describe('the three ops content/ does not yet use (ADR-0009)', () => {
  const VERSION = 'house-flanking@1.0.0';

  const body = {
    key: 'condition.prone.attacked',
    phase: 'modifiers',
    priority: 10,
    label: 'Prone target',
    description: 'An attack against a prone creature has advantage within 5 feet.',
    tags: ['condition'],
    condition: null,
    effects: [],
    citation: { source: 'srd-5.2.1', section: 'Rules Glossary > Prone' },
    interpretation: null,
  } satisfies Omit<Extract<RuleEntry, { op: 'add' }>, 'op'>;

  it('gives an override the same body columns as an add', () => {
    const row = ruleRow({ ...body, op: 'override' }, VERSION);
    expect(row).toMatchObject({
      id: `${VERSION}#condition.prone.attacked`,
      op: 'override',
      phase: 'modifiers',
      priority: 10,
    });
    expect(row.patch ?? null).toBeNull();
    expect(row.reason ?? null).toBeNull();
  });

  it('stores a patch whole and leaves the body columns null', () => {
    const patch = { op: 'patch', key: body.key, priority: 20 } as const;
    const row = ruleRow(patch, VERSION);

    expect(row.patch).toEqual(patch);
    expect(row.phase ?? null).toBeNull();
    expect(row.priority ?? null).toBeNull();
  });

  it('keeps a patch that clears an interpretation distinct from one that never mentioned it', () => {
    const clears = { op: 'patch', key: body.key, interpretation: null } as const;
    const silent = { op: 'patch', key: body.key, priority: 20 } as const;

    expect(ruleRow(clears, VERSION).patch).toEqual(clears);
    expect(ruleRow(silent, VERSION).patch).toEqual(silent);
    expect(ruleRow(clears, VERSION).patch).not.toEqual(ruleRow(silent, VERSION).patch);
  });

  it('stores a disable as its reason and nothing else', () => {
    const row = ruleRow(
      { op: 'disable', key: body.key, reason: 'the house does not use it' },
      VERSION,
    );
    expect(row).toMatchObject({ op: 'disable', reason: 'the house does not use it' });
    expect(row.effects ?? null).toBeNull();
    expect(row.patch ?? null).toBeNull();
  });
});
