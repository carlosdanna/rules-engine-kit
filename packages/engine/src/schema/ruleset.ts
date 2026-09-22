import { z } from 'zod';
import { Semver } from './primitives';
import { Conflict, ResolvedRule, RuleEntry } from './rule';

export const RulesetKind = z.enum(['base', 'layer']);
export type RulesetKind = z.infer<typeof RulesetKind>;

/** The base a layer applies to, and the versions of it the layer is compatible with (VR-3). */
export const BaseRef = z.strictObject({
  id: z.string().min(1),
  /** A semver range, e.g. `^5.2.0`. Resolution fails outright if the stack is incompatible. */
  range: z.string().min(1),
});
export type BaseRef = z.infer<typeof BaseRef>;

export const FactType = z.enum(['number', 'string', 'boolean', 'numberList', 'stringList']);
export type FactType = z.infer<typeof FactType>;

/**
 * One entry of the pack's fact registry (`facts.yaml`). Every `var` path a condition reads
 * must appear here; an unregistered path is an error, never a silent `null` (FR-17). Both
 * raw paths and the values rules derive are registered (ADR-0006).
 */
export const FactDefinition = z.strictObject({
  path: z.string().min(1),
  type: FactType,
  description: z.string().min(1),
  /** True for values assembled during evaluation, e.g. `actor.ac.effective`. */
  derived: z.boolean(),
});
export type FactDefinition = z.infer<typeof FactDefinition>;

/**
 * Who a pack is, without what it contains — exactly what `pack.yaml` carries.
 *
 * Split out from `RulesetVersion` so `content:lint` can parse one authored document at a
 * time and name the file it came from. A `RulesetVersion` assembled from three files
 * reports a bad `license` at `license`, which is no help when a tree holds six packs.
 *
 * `license` and `attribution` are required and non-empty: seeding fails without them
 * (NFR-6).
 */
const RulesetIdentity = z.strictObject({
  /** Ruleset slug, stable across versions, e.g. `dnd5e-srd`. */
  id: z.string().min(1),
  version: Semver,
  name: z.string().min(1),
  kind: RulesetKind,
  extends: BaseRef.nullable(),
  license: z.string().min(1),
  sourceUrl: z.url(),
  attribution: z.string().min(1),
});

const LAYER_DECLARES_ITS_BASE =
  'a layer must declare the base it extends, and a base must not (VR-3)';

const isCoherentLayer = (pack: { kind: RulesetKind; extends: BaseRef | null }): boolean =>
  (pack.kind === 'layer') === (pack.extends !== null);

/** `pack.yaml` on its own, before `facts.yaml` and `rules/*.yaml` are joined to it. */
export const PackManifest = RulesetIdentity.refine(isCoherentLayer, LAYER_DECLARES_ITS_BASE);
export type PackManifest = z.infer<typeof PackManifest>;

/**
 * An immutable, semver-tagged collection of rules (VR-1). A base stands alone; a layer
 * adds, overrides, patches or disables rules of the base it declares.
 */
export const RulesetVersion = RulesetIdentity.extend({
  facts: z.array(FactDefinition),
  rules: z.array(RuleEntry),
}).refine(isCoherentLayer, LAYER_DECLARES_ITS_BASE);
export type RulesetVersion = z.infer<typeof RulesetVersion>;

export const ProfileSource = z.strictObject({
  layer: z.string().min(1),
  version: Semver,
});
export type ProfileSource = z.infer<typeof ProfileSource>;

/**
 * An ordered stack of ruleset versions merged into one rule list (FR-2). `sources` is in
 * declared order, position 0 being the base, and `hash` is the canonical JSON of the
 * ordered resolved rules plus the layer identities — so it changes when a patch changes a
 * priority, which is correct: ordering is part of the result (ADR-0009, VR-7).
 */
export const ResolvedProfile = z.strictObject({
  /** Ordered by phase, then priority, then `rule_key`. Includes disabled rules. */
  rules: z.array(ResolvedRule),
  hash: z.string().min(1),
  sources: z.array(ProfileSource).min(1),
  conflicts: z.array(Conflict),
});
export type ResolvedProfile = z.infer<typeof ResolvedProfile>;
