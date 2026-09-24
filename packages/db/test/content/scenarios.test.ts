/**
 * The scenario envelope (ADR-0028).
 *
 * The template form is the one that carries a risk worth a test: it stores no situation, so
 * everything about it depends on rendering still working. A template that stops rendering must
 * fail *here*, loudly, rather than seeding a scenario that silently no longer matches the
 * template it names.
 */

import { describe, expect, it } from 'vitest';
import {
  ContentLoadError,
  loadContentTree,
  loadScenarioDoc,
  loadScenarios,
} from '../../src/content';
import { CONTENT_DIR, SCENARIOS_DIR } from '../../src/paths';

const content = loadContentTree(CONTENT_DIR, SCENARIOS_DIR);
const sources = { templates: content.templates, fixtures: content.fixtures };

describe('scenarios/', () => {
  it('renders one scenario per starter template, plus the acceptance scenarios', () => {
    expect(content.scenarios.map((scenario) => scenario.slug).sort()).toEqual([
      'ability-check-vs-dc',
      'buffed-round',
      'combat-start',
      'inspiration-on-an-attack',
      'melee-attack',
      'prone-and-flanked',
      'ranged-attack-with-cover',
      'saving-throw-vs-effect',
      'use-an-object',
    ]);
    const fromTemplates = content.scenarios.flatMap((scenario) =>
      scenario.templateId === null ? [] : [scenario.templateId],
    );
    expect(new Set(fromTemplates)).toEqual(
      new Set(content.templates.map((template) => template.id)),
    );
  });

  it('reads the literal form too: no template emits a useObject step (ADR-0028)', () => {
    const useObject = content.scenarios.find((scenario) => scenario.slug === 'use-an-object');
    expect(useObject?.templateId).toBeNull();
    expect(useObject?.situation.timeline[0]?.action).toEqual({ type: 'useObject' });
  });

  it('closes each situation over its content, so it replays without the fixtures (ADR-0017)', () => {
    for (const scenario of content.scenarios) {
      expect(scenario.situation.actors.length).toBeGreaterThan(0);
      expect(scenario.situation.timeline.length).toBeGreaterThan(0);
      for (const actor of scenario.situation.actors) expect(actor.name).toBeTruthy();
    }
  });

  it('keeps the template and params a correction is re-rendered from (ADR-0017)', () => {
    const melee = content.scenarios.find((scenario) => scenario.slug === 'melee-attack');
    expect(melee).toMatchObject({ templateId: 'melee-attack', params: {} });
  });
});

describe('the envelope', () => {
  const TEMPLATE_FORM = {
    slug: 'hand-written',
    name: 'A template call written by hand',
    profile: 'srd-5.2.1',
    template: 'melee-attack',
    params: { rangeFt: 10 },
  };

  it('renders the template form against the profile it names, which picks the variant', () => {
    const under51 = loadScenarioDoc({ ...TEMPLATE_FORM, profile: 'srd-5.1' }, 'test.yaml', sources);
    const under521 = loadScenarioDoc(TEMPLATE_FORM, 'test.yaml', sources);

    // `goblin` is two stat blocks, one per edition (ADR-0026); the profile is what chooses.
    expect(under51.situation.actors).not.toEqual(under521.situation.actors);
  });

  it('passes params through to the render', () => {
    const rendered = loadScenarioDoc(TEMPLATE_FORM, 'test.yaml', sources);
    const [step] = rendered.situation.timeline;
    expect(step?.action).toMatchObject({ rangeFt: 10 });
  });

  it('accepts a literal situation, which is what an exported user scenario is (ADR-0004)', () => {
    const rendered = loadScenarioDoc(TEMPLATE_FORM, 'test.yaml', sources);
    const literal = loadScenarioDoc(
      { slug: 'exported', name: 'Exported', situation: rendered.situation },
      'test.yaml',
      sources,
    );

    expect(literal).toMatchObject({ templateId: null, params: null });
    expect(literal.situation).toEqual(rendered.situation);
  });

  it('refuses a file that is neither form', () => {
    expect(() => loadScenarioDoc({ slug: 'x', name: 'X' }, 'test.yaml', sources)).toThrow(
      ContentLoadError,
    );
  });

  it('refuses a template nothing declares, rather than seeding an empty scenario', () => {
    expect(() =>
      loadScenarioDoc({ ...TEMPLATE_FORM, template: 'no-such-template' }, 'test.yaml', sources),
    ).toThrow(/no-such-template/);
  });

  it('refuses a profile the fixtures are not scoped to, naming the file and the profile', () => {
    expect(() =>
      loadScenarioDoc({ ...TEMPLATE_FORM, profile: 'srd-5.1+flanking' }, 'test.yaml', sources),
    ).toThrow(/does not render under profile 'srd-5.1\+flanking'/);
  });

  it('reads an absent scenarios/ as none, not as an error', () => {
    expect(loadScenarios('/no/such/directory', sources)).toEqual([]);
  });
});
