import { z } from 'zod';
import { Condition } from './condition';
import { Effect } from './effect';
import { Citation, Phase, Semver } from './primitives';

export const RuleOp = z.enum(['add', 'override', 'patch', 'disable']);
export type RuleOp = z.infer<typeof RuleOp>;

/**
 * `patch` may only touch fields that do not change what a rule decides, so a full rule
 * body always exists to diff against (ADR-0009, VR-2). Changing `phase`, `condition` or
 * `effects` requires `override`.
 */
export const PATCHABLE_RULE_FIELDS = [
  'priority',
  'label',
  'description',
  'tags',
  'citation',
  'interpretation',
] as const;

export type PatchableRuleField = (typeof PATCHABLE_RULE_FIELDS)[number];

/**
 * One rule body (FR-5). A rule has no version of its own: it is versioned by the
 * `RulesetVersion` that carries it, and `ResolvedRule.provenance` records which layer
 * supplied the body that survived (VR-4).
 *
 * Actors are named symbolically inside `effects`, because a rule is written before any
 * situation exists.
 */
export const Rule = z.strictObject({
  /** `domain.concept[.detail]`, lowercase, stable across versions. Renames change `label`. */
  key: z.string().min(1),
  phase: Phase,
  /** Within a phase, rules run by priority then `key`, so ordering is stable (FR-9). */
  priority: z.number().int(),
  label: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)),
  /** `null` means the rule always applies once selected for its phase. */
  condition: Condition.nullable(),
  effects: z.array(Effect),
  citation: Citation,
  /** Required wherever the SRD wording is ambiguous and we had to decide. */
  interpretation: z.string().min(1).nullable(),
});
export type Rule = z.infer<typeof Rule>;

const RuleAdd = Rule.extend({ op: z.literal('add') });
const RuleOverride = Rule.extend({ op: z.literal('override') });

const RulePatch = z
  .strictObject({
    op: z.literal('patch'),
    key: z.string().min(1),
    priority: z.number().int().optional(),
    label: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    citation: Citation.optional(),
    interpretation: z.string().min(1).nullable().optional(),
  })
  .refine(
    (patch) => PATCHABLE_RULE_FIELDS.some((field) => field in patch),
    'a patch must change at least one of the patchable fields',
  );

const RuleDisable = z.strictObject({
  op: z.literal('disable'),
  key: z.string().min(1),
  reason: z.string().min(1).nullable(),
});

/**
 * What a ruleset version declares for one `rule_key`. `add` and `override` carry a whole
 * body; `patch` carries only whitelisted fields; `disable` carries none. Anything a layer
 * cannot express here has to be an `override`, which is the point (ADR-0009).
 */
export const RuleEntry = z.discriminatedUnion('op', [
  RuleAdd,
  RuleOverride,
  RulePatch,
  RuleDisable,
]);
export type RuleEntry = z.infer<typeof RuleEntry>;

/** Base first, last wins; every op that touched the key is recorded (VR-4). */
export const RuleProvenance = z.strictObject({
  layer: z.string().min(1),
  version: Semver,
  op: RuleOp,
});
export type RuleProvenance = z.infer<typeof RuleProvenance>;

/**
 * A rule after layer merge. Disabled rules stay in the list, flagged, so "why not" can
 * still name the layer that disabled them — which makes the resolved list a superset of
 * the active rules, and the evaluator must check `enabled`.
 */
export const ResolvedRule = Rule.extend({
  enabled: z.boolean(),
  provenance: z.array(RuleProvenance).min(1),
});
export type ResolvedRule = z.infer<typeof ResolvedRule>;

/**
 * Collected and returned rather than thrown, so `/profiles` can show them (FR-12). Only an
 * incompatible base range fails resolution outright (VR-3).
 */
export const Conflict = z.strictObject({
  kind: z.enum([
    'duplicate-add',
    'override-missing',
    'patch-missing',
    'patch-forbidden-field',
    'disable-missing',
    'priority-tie',
  ]),
  ruleKey: z.string().min(1),
  layer: z.string().min(1),
  detail: z.string().min(1),
});
export type Conflict = z.infer<typeof Conflict>;
