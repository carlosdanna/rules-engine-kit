import { z } from 'zod';
import { FixtureKind } from './fixture';
import { Json } from './json';
import { RollTargetKind } from './primitives';

/**
 * Bumped whenever the shape changes; `templates.schema_version` records which one a row
 * was seeded at (VR-8). At 2 since ADR-0028 gave a template the `description` the
 * `templates` table and `/templates` need. That it was free to bump is the point: no row
 * had ever been written, and M3 is the last milestone where that is true.
 */
export const TEMPLATE_SCHEMA_VERSION = 2;

/**
 * A typed parameter the UI generates a form control from (FR-19). The vocabulary is
 * closed on purpose: `docs/content-authoring.md` says anything more complex is edited in
 * the JSON tab, which is a promise that the form never has to guess.
 *
 * Every param carries a `default`, because `content:lint` renders each template with its
 * defaults (Q24) and a scenario created from a template has to start somewhere.
 */
const ParamDefaults = {
  fixture: z.strictObject({
    type: z.literal('fixture'),
    /** Which fixture list the picker draws from. */
    kind: FixtureKind,
    /** A fixture slug; that it resolves under every suggested profile is Q24's check. */
    default: z.string().min(1),
  }),
  number: z.strictObject({
    type: z.literal('number'),
    default: z.number(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  boolean: z.strictObject({ type: z.literal('boolean'), default: z.boolean() }),
  enum: z.strictObject({
    type: z.literal('enum'),
    values: z.array(z.string().min(1)).min(1),
    default: z.string().min(1),
  }),
  /** Condition names as the rules read them, e.g. `prone`. */
  conditionList: z.strictObject({
    type: z.literal('conditionList'),
    default: z.array(z.string().min(1)),
  }),
  /**
   * A per-roll player choice, declared up front because evaluation never pauses
   * (ADR-0003, ADR-0011). `roll` plus the step being rendered is enough to derive the
   * roll id the skeleton addresses as `$rollId(<roll>)`.
   */
  rollChoice: z.strictObject({
    type: z.literal('rollChoice'),
    roll: RollTargetKind,
    /** The one structured member of `RollChoice` (`schema/situation.ts`). */
    choice: z.literal('rerollDieIndex'),
    default: z.number().int().nonnegative(),
  }),
};

export const TemplateParam = z
  .discriminatedUnion('type', [
    ParamDefaults.fixture,
    ParamDefaults.number,
    ParamDefaults.boolean,
    ParamDefaults.enum,
    ParamDefaults.conditionList,
    ParamDefaults.rollChoice,
  ])
  .refine(
    (param) => param.type !== 'enum' || param.values.includes(param.default),
    'an enum param default must be one of its values',
  );
export type TemplateParam = z.infer<typeof TemplateParam>;

/**
 * A situation with holes in it (FR-18, FR-19). `renderTemplate` fills the holes from
 * `params` and inlines every fixture it names, so the situation it returns is closed over
 * its content (ADR-0017).
 *
 * `skeleton` is plain JSON here. Its `{{param}}` and `$rollId(attack)` placeholders are
 * `renderTemplate`'s vocabulary, and that function is unwritten (Q24) — validating them
 * twice, in two places, is exactly the schema drift `schema/index.ts` exists to avoid.
 */
export const Template = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  /** One or two sentences: what this template is for, as `/templates` lists it (ADR-0028). */
  description: z.string().min(1),
  tags: z.array(z.string().min(1)),
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
  /** The profiles a golden test runs this template under (NFR-4). */
  suggestedProfiles: z.array(z.string().min(1)).min(1),
  params: z.record(z.string().min(1), TemplateParam),
  skeleton: Json,
});
export type Template = z.infer<typeof Template>;
