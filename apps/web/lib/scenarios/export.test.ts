/**
 * What the Export button hands the browser (ADR-0029).
 *
 * The round trip — these bytes parsed back by `loadScenarioDoc` into the same situation — is
 * asserted in `packages/db/test/content/serialize.test.ts`, beside the loader that has to read
 * them. What is checked here is the part the app owns: the filename `scenarios/` expects, and
 * that a template-backed row still exports as a literal. That second one is ADR-0029(c), and
 * it is the easy thing to regress by "helpfully" emitting the template call instead.
 *
 * Assertions are over the text rather than a parsed document because `yaml` is a dependency of
 * `packages/db`, not of the web app, and does not resolve from here — which is the same reason
 * the serialising happens server-side in the first place.
 */

import { blankSituation, SITUATION_SCHEMA_VERSION } from '@rules-engine-kit/engine';
import { describe, expect, it } from 'vitest';
import { scenarioExport } from './export';

const row = {
  id: 'my-situation',
  name: 'Something I built',
  situation: blankSituation(),
  templateId: 'melee-attack',
  params: { rangeFt: 5 },
  origin: 'user' as const,
  schemaVersion: SITUATION_SCHEMA_VERSION,
};

/** Top-level keys are the ones written flush left; everything nested is indented. */
const topLevelKeys = (yaml: string): string[] =>
  yaml.split('\n').flatMap((line) => /^([a-zA-Z]+):/.exec(line)?.[1] ?? []);

describe('scenarioExport', () => {
  it('names the file the way scenarios/ expects to find it', () => {
    expect(scenarioExport(row).filename).toBe('my-situation.yaml');
  });

  it('emits the literal form even though the row came from a template', () => {
    expect(topLevelKeys(scenarioExport(row).yaml).sort()).toEqual(['name', 'situation', 'slug']);
  });

  it('carries the slug and name the loader keys the row on', () => {
    const yaml = scenarioExport(row).yaml;
    expect(yaml).toContain('slug: my-situation');
    expect(yaml).toContain('name: Something I built');
  });

  it('refuses a row whose situation is not one', () => {
    expect(() => scenarioExport({ ...row, situation: { nope: true } as never })).toThrow();
  });
});
