/**
 * What a server action is allowed to accept (ADR-0029).
 *
 * `ScenarioInput` is the boundary between the form and the database, and it is the only
 * validation an action performs before writing — a Server Action is a public POST endpoint, so
 * a payload that never went through the UI has to be refused here or not at all.
 *
 * These schemas live in `packages/db` rather than in the app because `zod` does not resolve
 * from `apps/web` at all, which is worth a test of its own: if the app ever grew its own copy,
 * it could drift from the shape the seeder reads.
 */

import { blankSituation } from '@rules-engine-kit/engine';
import { describe, expect, it } from 'vitest';
import { ScenarioInput } from '../../src/content/scenario';

const template = {
  slug: 'my-scenario',
  name: 'My scenario',
  body: {
    kind: 'template',
    templateId: 'melee-attack',
    profile: 'srd-5.1',
    params: { rangeFt: 5 },
  },
};

const literal = {
  slug: 'my-scenario',
  name: 'My scenario',
  body: { kind: 'literal', situation: blankSituation() },
};

describe('ScenarioInput', () => {
  it('accepts what the template form sends', () => {
    expect(ScenarioInput.safeParse(template).success).toBe(true);
  });

  it('accepts what the JSON editor sends', () => {
    expect(ScenarioInput.safeParse(literal).success).toBe(true);
  });

  it.each([
    ['Melee Attack', 'an uppercase slug'],
    ['melee attack', 'a slug with a space'],
    ['-melee', 'a leading hyphen'],
    ['melee--attack', 'a doubled hyphen'],
    ['', 'an empty slug'],
  ])('rejects %j — %s', (slug) => {
    expect(ScenarioInput.safeParse({ ...literal, slug }).success).toBe(false);
  });

  it('rejects a blank name, and trims a padded one', () => {
    expect(ScenarioInput.safeParse({ ...literal, name: '   ' }).success).toBe(false);

    const parsed = ScenarioInput.safeParse({ ...literal, name: '  Padded  ' });
    expect(parsed.success && parsed.data.name).toBe('Padded');
  });

  /** The situation is parsed, not trusted: the client's JSON tab can contain anything. */
  it('rejects a literal body whose situation is not one', () => {
    expect(
      ScenarioInput.safeParse({ ...literal, body: { kind: 'literal', situation: { nope: true } } })
        .success,
    ).toBe(false);
  });

  it('rejects a body that is neither arm', () => {
    expect(ScenarioInput.safeParse({ ...literal, body: { kind: 'other' } }).success).toBe(false);
  });

  /** `profile` is required on the template arm: it is what picks a fixture variant (ADR-0026). */
  it('rejects a template body with no profile to render against', () => {
    const { profile: _dropped, ...body } = template.body;
    expect(ScenarioInput.safeParse({ ...template, body }).success).toBe(false);
  });

  /** `origin` is the writer's to set, never the caller's (ADR-0004). */
  it('refuses an unknown key rather than ignoring it', () => {
    expect(ScenarioInput.safeParse({ ...literal, origin: 'seed' }).success).toBe(false);
  });
});
