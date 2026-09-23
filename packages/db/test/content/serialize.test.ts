/**
 * Export round-trips (ADR-0004, ADR-0029).
 *
 * ADR-0004 says a user scenario "can be exported to YAML and promoted into `scenarios/`".
 * That claim is only true if the bytes this writes are bytes `loadScenarioDoc` reads back
 * into the same situation, so the test is the round trip rather than a snapshot of the YAML:
 * a snapshot would go green on a file the seeder rejects.
 */

import { buildFixtureIndex, renderTemplate } from '@rules-engine-kit/engine';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { isTemplateScenario } from '../../src/content/scenario';
import { loadScenarioDoc } from '../../src/content/scenarios';
import { literalScenarioFile, scenarioFileName, scenarioToYaml } from '../../src/content/serialize';
import { seedContent } from '../seed/helpers';

/** A real situation, rendered the way the app renders one, rather than a hand-built stub. */
function aSituation() {
  const content = seedContent();
  const template = content.templates.find((candidate) => candidate.id === 'melee-attack');
  if (template === undefined) throw new Error('melee-attack template is missing');
  return renderTemplate(template, {}, buildFixtureIndex(content.fixtures), 'srd-5.1');
}

describe('scenarioToYaml', () => {
  it('round-trips through the loader unchanged', () => {
    const situation = aSituation();
    const yaml = scenarioToYaml({ id: 'my-situation', name: 'Something I built', situation });

    const loaded = loadScenarioDoc(parseYaml(yaml), 'my-situation.yaml', {
      templates: [],
      fixtures: [],
    });

    expect(loaded.slug).toBe('my-situation');
    expect(loaded.name).toBe('Something I built');
    expect(loaded.situation).toEqual(situation);
  });

  /** The literal form carries no template, so the loader needs no `content/` to read it. */
  it('exports the literal form even for a template-backed row', () => {
    const file = literalScenarioFile({
      id: 'from-a-template',
      name: 'From a template',
      situation: aSituation(),
    });

    expect(isTemplateScenario(file)).toBe(false);
    expect(file).not.toHaveProperty('profile');
    expect(file).not.toHaveProperty('template');
  });

  it('refuses a row whose situation is not one', () => {
    expect(() =>
      scenarioToYaml({ id: 'broken', name: 'Broken', situation: { nope: true } }),
    ).toThrow();
  });

  it('names the file the way the loader expects to find it', () => {
    expect(scenarioFileName('my-situation')).toBe('my-situation.yaml');
  });
});
