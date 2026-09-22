/**
 * `content:lint` is FR-17: "lint on load: unknown facts, duplicate keys, overrides of
 * missing keys, missing citations", plus NFR-6's licence and attribution.
 *
 * This file tests the pure half — the checks themselves, over documents someone else has
 * already parsed. Walking a directory and turning YAML into those documents is
 * `packages/db/src/content`'s job and is tested there, so nothing here touches a disk.
 *
 * Two properties matter as much as the individual checks and are asserted on their own:
 * every issue names the file it is in, and one run reports every problem rather than
 * stopping at the first.
 */

import { describe, expect, it } from 'vitest';
import { type ContentDocs, lintContent } from '../../src/content';

const MANIFEST = {
  id: 'dnd5e-srd',
  version: '5.2.1',
  name: 'SRD 5.2.1',
  kind: 'base',
  extends: null,
  license: 'CC-BY-4.0',
  sourceUrl: 'https://www.dndbeyond.com/srd',
  attribution: 'This work includes material from the System Reference Document 5.2.1.',
};

const FACTS = [
  { path: 'action.type', type: 'string', description: 'the declared action kind' },
  { path: 'actor.conditions', type: 'stringList', description: 'conditions on the actor' },
];

const CITATION = { source: 'srd-5.2.1', section: 'Rules Glossary > Prone [Condition]' };

function rule(key: string, over: Record<string, unknown> = {}) {
  return {
    key,
    op: 'add',
    phase: 'modifiers',
    priority: 0,
    description: `what ${key} does`,
    condition: { '==': [{ var: 'action.type' }, 'attack'] },
    effects: [],
    citation: CITATION,
    ...over,
  };
}

/** One base pack, with whatever rule files the case needs. */
function tree(
  rules: { file: string; doc: unknown }[],
  over: Partial<ContentDocs> & { manifest?: unknown; facts?: unknown } = {},
): ContentDocs {
  const { manifest = MANIFEST, facts = FACTS, ...rest } = over;
  return {
    packs: [
      {
        dir: 'content/dnd5e-srd-5.2.1',
        manifest: { file: 'content/dnd5e-srd-5.2.1/pack.yaml', doc: manifest },
        facts: { file: 'content/dnd5e-srd-5.2.1/facts.yaml', doc: facts },
        rules,
      },
    ],
    fixtures: [],
    templates: [],
    ...rest,
  };
}

const codes = (docs: ContentDocs) => lintContent(docs).map((issue) => issue.code);

describe('a clean pack', () => {
  it('reports nothing', () => {
    const docs = tree([{ file: 'rules/prone.yaml', doc: rule('condition.prone') }]);
    expect(lintContent(docs)).toEqual([]);
  });
});

describe('licence and attribution (NFR-6)', () => {
  it('names a missing licence rather than dumping a schema error', () => {
    const { license: _license, ...unlicensed } = MANIFEST;
    const [issue] = lintContent(tree([], { manifest: unlicensed }));
    expect(issue).toMatchObject({
      code: 'missing-license',
      severity: 'error',
      file: 'content/dnd5e-srd-5.2.1/pack.yaml',
      path: 'license',
    });
    expect(issue?.message).toMatch(/NFR-6/);
  });

  it('names a missing attribution', () => {
    const { attribution: _attribution, ...unattributed } = MANIFEST;
    expect(codes(tree([], { manifest: unattributed }))).toContain('missing-attribution');
  });

  it('treats an empty licence as missing, not as a licence', () => {
    expect(codes(tree([], { manifest: { ...MANIFEST, license: '   ' } }))).toContain(
      'missing-license',
    );
  });
});

describe('citations (FR-17, CONTRIBUTING.md)', () => {
  it('names a rule with no citation', () => {
    const { citation: _citation, ...uncited } = rule('condition.prone');
    const [issue] = lintContent(tree([{ file: 'rules/prone.yaml', doc: uncited }]));
    expect(issue).toMatchObject({
      code: 'missing-citation',
      file: 'rules/prone.yaml',
      path: 'citation',
    });
  });

  it('names a rule whose citation has no section', () => {
    const doc = rule('condition.prone', { citation: { source: 'srd-5.2.1' } });
    expect(codes(tree([{ file: 'rules/prone.yaml', doc }]))).toContain('missing-citation');
  });

  it('names an uncited fixture', () => {
    const docs = tree([], {
      fixtures: [
        {
          file: 'content/fixtures/goblin.yaml',
          doc: { slug: 'goblin', kind: 'actor', rulesetScope: ['srd-5.2.1'], data: {} },
        },
      ],
    });
    expect(codes(docs)).toContain('missing-citation');
  });
});

describe('conditions (FR-17, ADR-0013)', () => {
  it('names a var reading a path facts.yaml does not register', () => {
    const doc = rule('condition.prone', {
      condition: { in: ['prone', { var: 'target.conditions' }] },
    });
    const [issue] = lintContent(tree([{ file: 'rules/prone.yaml', doc }]));
    expect(issue).toMatchObject({ code: 'unknown-fact', file: 'rules/prone.yaml' });
    expect(issue?.message).toMatch(/target\.conditions/);
  });

  it('names an operator outside the closed subset, which only a raw walk can see', () => {
    const doc = rule('condition.prone', { condition: { '===': [{ var: 'action.type' }, 'x'] } });
    expect(codes(tree([{ file: 'rules/prone.yaml', doc }]))).toContain('unsupported-operator');
  });

  it('reports the pointer to the sub-expression, not just the file', () => {
    const doc = rule('condition.prone', {
      condition: { all: [{ '==': [{ var: 'nope' }, 1] }] },
    });
    const [issue] = lintContent(tree([{ file: 'rules/prone.yaml', doc }]));
    expect(issue?.path).toMatch(/all/);
  });

  it('lets a layer read a path its base registered', () => {
    const layerRule = rule('house.flanking', {
      condition: { in: ['prone', { var: 'actor.conditions' }] },
    });
    const docs = tree([], {
      packs: [
        ...tree([]).packs,
        {
          dir: 'content/house-flanking-1.0.0',
          manifest: {
            file: 'content/house-flanking-1.0.0/pack.yaml',
            doc: {
              ...MANIFEST,
              id: 'house-flanking',
              version: '1.0.0',
              name: 'House flanking',
              kind: 'layer',
              extends: { id: 'dnd5e-srd', range: '^5.2.0' },
            },
          },
          facts: { file: 'content/house-flanking-1.0.0/facts.yaml', doc: [] },
          rules: [{ file: 'content/house-flanking-1.0.0/rules/flanking.yaml', doc: layerRule }],
        },
      ],
    });
    expect(codes(docs)).not.toContain('unknown-fact');
  });
});

describe('rule keys and layer ops (FR-17, VR-2)', () => {
  it('names a duplicate rule key, and the second file that declared it', () => {
    const docs = tree([
      { file: 'rules/prone-a.yaml', doc: rule('condition.prone') },
      { file: 'rules/prone-b.yaml', doc: rule('condition.prone') },
    ]);
    const [issue] = lintContent(docs).filter((i) => i.code === 'duplicate-rule-key');
    expect(issue).toMatchObject({ code: 'duplicate-rule-key', file: 'rules/prone-b.yaml' });
  });

  it('names an override of a key no layer below it defines', () => {
    const doc = rule('condition.prone', { op: 'override' });
    expect(codes(tree([{ file: 'rules/prone.yaml', doc }]))).toContain('override-missing');
  });

  it('names a patch of a key no layer below it defines', () => {
    const doc = { key: 'condition.prone', op: 'patch', priority: 5 };
    expect(codes(tree([{ file: 'rules/prone.yaml', doc }]))).toContain('patch-missing');
  });

  it('names a disable of a key no layer below it defines', () => {
    const doc = { key: 'condition.prone', op: 'disable', reason: 'not in this edition' };
    expect(codes(tree([{ file: 'rules/prone.yaml', doc }]))).toContain('disable-missing');
  });

  it('warns rather than fails on a priority tie: deterministic, but nobody chose it', () => {
    const docs = tree([
      { file: 'rules/a.yaml', doc: rule('a.one') },
      { file: 'rules/b.yaml', doc: rule('b.two') },
    ]);
    const ties = lintContent(docs).filter((issue) => issue.code === 'priority-tie');
    expect(ties).toHaveLength(1);
    expect(ties[0]?.severity).toBe('warning');
  });

  it('names a layer whose base is in no pack it was given', () => {
    const docs: ContentDocs = {
      packs: [
        {
          dir: 'content/house-flanking-1.0.0',
          manifest: {
            file: 'content/house-flanking-1.0.0/pack.yaml',
            doc: {
              ...MANIFEST,
              id: 'house-flanking',
              version: '1.0.0',
              kind: 'layer',
              extends: { id: 'nonesuch', range: '^1.0.0' },
            },
          },
          facts: { file: 'content/house-flanking-1.0.0/facts.yaml', doc: [] },
          rules: [],
        },
      ],
      fixtures: [],
      templates: [],
    };
    expect(codes(docs)).toContain('unresolvable-base');
  });

  it('resolves a layer against a base whose version satisfies its range (VR-3)', () => {
    const docs = tree([{ file: 'rules/prone.yaml', doc: rule('condition.prone') }], {
      packs: [
        ...tree([{ file: 'rules/prone.yaml', doc: rule('condition.prone') }]).packs,
        {
          dir: 'content/house-flanking-1.0.0',
          manifest: {
            file: 'content/house-flanking-1.0.0/pack.yaml',
            doc: {
              ...MANIFEST,
              id: 'house-flanking',
              version: '1.0.0',
              kind: 'layer',
              extends: { id: 'dnd5e-srd', range: '^5.2.0' },
            },
          },
          facts: { file: 'content/house-flanking-1.0.0/facts.yaml', doc: [] },
          rules: [
            {
              file: 'content/house-flanking-1.0.0/rules/prone.yaml',
              doc: rule('condition.prone', { op: 'override' }),
            },
          ],
        },
      ],
    });
    expect(codes(docs)).not.toContain('override-missing');
  });
});

describe('schema errors', () => {
  it('reports a bad phase against the rule file', () => {
    const doc = rule('condition.prone', { phase: 'initiative' });
    const [issue] = lintContent(tree([{ file: 'rules/prone.yaml', doc }]));
    expect(issue).toMatchObject({ code: 'schema', file: 'rules/prone.yaml' });
  });

  it('reports a duplicate fact path against facts.yaml', () => {
    const facts = [...FACTS, FACTS[0]];
    const [issue] = lintContent(tree([], { facts }));
    expect(issue).toMatchObject({
      code: 'duplicate-fact',
      file: 'content/dnd5e-srd-5.2.1/facts.yaml',
    });
  });

  it('reports a template whose enum default is not one of its values', () => {
    const docs = tree([], {
      templates: [
        {
          file: 'content/templates/melee.yaml',
          doc: {
            id: 'melee',
            name: 'Melee',
            schemaVersion: 1,
            suggestedProfiles: ['srd-5.2.1'],
            params: { mode: { type: 'enum', values: ['melee'], default: 'ranged' } },
            skeleton: {},
          },
        },
      ],
    });
    expect(codes(docs)).toContain('schema');
  });
});

describe('the report as a whole', () => {
  it('collects every problem in one pass rather than stopping at the first', () => {
    const { citation: _citation, ...uncited } = rule('a.one');
    const docs = tree(
      [
        { file: 'rules/a.yaml', doc: uncited },
        { file: 'rules/b.yaml', doc: rule('b.two', { condition: { var: 'nope' } }) },
        { file: 'rules/c.yaml', doc: rule('c.three', { op: 'override' }) },
      ],
      { manifest: { ...MANIFEST, license: '' } },
    );
    expect(new Set(codes(docs))).toEqual(
      new Set(['missing-license', 'missing-citation', 'unknown-fact', 'override-missing']),
    );
  });

  it('does not let a missing licence hide the mistakes in the pack below it', () => {
    const { citation: _citation, ...uncited } = rule('a.one');
    const docs = tree([{ file: 'rules/a.yaml', doc: uncited }], {
      manifest: { ...MANIFEST, license: '' },
    });
    expect(codes(docs)).toEqual(['missing-license', 'missing-citation']);
  });

  it('names a field once, in its own words, rather than also as Zod output', () => {
    const { citation: _citation, ...uncited } = rule('a.one');
    const raised = lintContent(tree([{ file: 'rules/a.yaml', doc: uncited }]));
    expect(raised.map((i) => i.code)).toEqual(['missing-citation']);
  });

  it('gives every issue a file an author can open', () => {
    const { citation: _citation, ...uncited } = rule('a.one');
    const docs = tree([{ file: 'rules/a.yaml', doc: uncited }], {
      manifest: { ...MANIFEST, license: '' },
    });
    for (const issue of lintContent(docs)) {
      expect(issue.file).not.toBe('');
    }
  });

  it('reports a layer`s conflicts once, however many bases it could pair with', () => {
    const base = (version: string) => ({
      dir: `content/dnd5e-srd-${version}`,
      manifest: {
        file: `content/dnd5e-srd-${version}/pack.yaml`,
        doc: { ...MANIFEST, version },
      },
      facts: { file: `content/dnd5e-srd-${version}/facts.yaml`, doc: FACTS },
      rules: [],
    });
    const docs: ContentDocs = {
      packs: [
        base('5.2.1'),
        base('5.2.2'),
        {
          dir: 'content/house-1.0.0',
          manifest: {
            file: 'content/house-1.0.0/pack.yaml',
            doc: {
              ...MANIFEST,
              id: 'house',
              version: '1.0.0',
              kind: 'layer',
              extends: { id: 'dnd5e-srd', range: '^5.2.0' },
            },
          },
          facts: { file: 'content/house-1.0.0/facts.yaml', doc: [] },
          rules: [
            {
              file: 'content/house-1.0.0/rules/prone.yaml',
              doc: rule('condition.prone', { op: 'override' }),
            },
          ],
        },
      ],
      fixtures: [],
      templates: [],
    };
    expect(codes(docs).filter((code) => code === 'override-missing')).toHaveLength(1);
  });
});
