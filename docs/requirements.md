# Requirements

A localhost-only demo of a deterministic, explainable, versioned rules engine. D&D 5e SRD content is the example domain.

## Core concepts

| Term | Meaning |
| --- | --- |
| Situation | Immutable input: actors, their state, inlined item fixtures, an ordered `timeline` of turns, `intents` (ADR-0005, ADR-0017) |
| Fact | Typed value the engine can read or derive, registered in the pack's fact registry |
| Step | One turn in the timeline: `round`, `actorId`, and zero or one action. Evaluation runs the phase loop once per step |
| Rule | `rule_key`, phase, priority, condition (JSON Logic), effects, citation, optional interpretation |
| Effect | set value · add modifier · roll mode · roll transform · roll dice · apply/remove condition · emit event · halt (ADR-0011) |
| Phase | Fixed resolution stage, run per step: `upkeep → declare → modifiers → roll → compare → damage → apply → expire` (ADR-0012) |
| Ruleset version | Immutable, semver-tagged collection of rules (base or layer) |
| Layer | Ruleset that adds, overrides, patches or disables rules of its base |
| Profile | Ordered stack of ruleset versions resolved into one rule list with a hash |
| Outcome | Per-step results, final state, derived values with their contributing terms, emitted events |
| Trace | Flat, versioned array of ordered events: rules considered/fired/skipped, facts read, rolls, comparisons, stacking, effect application and expiry (ADR-0014) |

## Scope: core subset

| Engine feature | Content that exercises it |
| --- | --- |
| Phases & d20 resolution | Attack vs AC, ability check vs DC, saving throw |
| Advantage/disadvantage cancelling | Prone, restrained, invisible, poisoned |
| Modifier stacking policies | Proficiency, ability modifier, Bless, cover |
| Damage pipeline | Damage dice, crits, resistance/vulnerability |
| Durations | Effects expiring at the start/end of a turn, Bless over rounds (needs a multi-turn timeline) |
| Versioned layers (5.1 vs 5.2.1) | Surprise, Inspiration vs Heroic Inspiration, one weapon mastery |
| House-rule layer | Flanking grants advantage |

Out of scope: reactions/interrupts, spells beyond Bless, movement/grids, classes and character building, forward chaining, pausing for player input.

## Functional requirements

- **FR-1** Validate situations, including their timeline of steps, against a versioned Zod schema.
- **FR-2** Accept an explicit profile (ordered ruleset versions).
- **FR-3** Return outcome + trace; never mutate input.
- **FR-5** Rules carry id/key, version, description, citation, phase, priority, tags, condition, effects.
- **FR-6** Conditions: all/any/not, comparisons, set membership, references to registered facts. JSON Logic syntax, own evaluator (ADR-0013).
- **FR-7** Effects as listed in Core concepts, implemented through an effect registry. Numeric modifiers, roll mode and roll transforms are three separate channels per roll target.
- **FR-8** Fixtures supply only printed values (ability scores, proficiency bonus, base AC, HP; an item's damage dice, properties and mastery). Ability modifiers come from the fact registry; effective AC, attack bonuses and save DCs are derived by rules and reported with their contributing terms.
- **FR-9** Each step runs the phases in fixed order; within a phase, priority then `rule_key` for stable ordering.
- **FR-11** Stacking policies per modifier type: sum, highest-only, same-`stackKey`-doesn't-stack. Advantage/disadvantage cancelling is resolved separately, on the roll-mode channel.
- **FR-12** Conflicts resolved by explicit `override` or layer order; unresolved conflicts are reported.
- **FR-13** Seeded RNG, seed recorded in outcome; dice results can be forced per **roll id** — not per step — including both dice of an advantage pair and each reroll (ADR-0011).
- **FR-14** Trace per rule: status, facts read with values, state delta, citation, and the layer that supplied it. Every rule selected for a phase is recorded, whether or not it fired.
- **FR-15** "Why / why not" explanation for any rule in a run, derived from the stored trace rather than by re-evaluating.
- **FR-16** Evaluate one situation under two profiles and diff outcomes and traces, aligning traces on step, phase and `rule_key`.
- **FR-17** Lint on load: unknown facts, duplicate keys, overrides of missing keys, missing citations.
- **FR-18** Create situations from a template, from a blank slate, or by duplicating a scenario.
- **FR-19** Templates declare typed params; the UI generates a form from them.
- **FR-20** A rendered situation is self-contained: `renderTemplate` inlines every fixture it references, and a weapon slug with nothing behind it is a schema error (ADR-0017).

## Versioning requirements

- **VR-1** Published ruleset versions are immutable; changes create a new semver version.
- **VR-2** Layers can `add`, `override`, `patch` or `disable` rules by `rule_key`. `patch` may only change `priority`, `label`, `description`, `tags`, `citation` and `interpretation`; changing `phase`, `condition` or `effects` requires `override` (ADR-0009).
- **VR-3** Layers declare base and compatible range; incompatible stacks fail at resolve time.
- **VR-4** Layer order is explicit, last wins; each resolved rule carries ordered provenance, and disabled rules stay in the resolved list flagged as disabled so they can still be explained.
- **VR-7** Evaluations store profile hash, seed, `engine_version`, `trace_schema_version`.
- **VR-8** Situation schema is versioned; saved user scenarios can be migrated.
- **VR-9** Diff rules between two ruleset versions.

Out of scope: VR-5 (select profile by campaign/date) and VR-6 (effective dates), closed by
ADR-0016. A profile is always an explicit ordered stack; a ruleset version is identified by semver
alone.

## Non-functional requirements

- **NFR-1** Determinism: pure engine core, no I/O, clock or global randomness.
- **NFR-3** Engine runs in Node and the browser.
- **NFR-4** Golden tests for every template × profile, asserting outcomes separately from trace snapshots; property tests for stacking, roll-mode cancelling and ordering.
- **NFR-5** Rules readable as YAML with schema validation.
- **NFR-6** Every pack declares license and attribution; seeding fails without them.
- **NFR-7** Trace exportable as JSON and viewable as narrative text.
- **NFR-8** Runs on localhost with `pnpm i && pnpm db:reset && pnpm dev`; no hosting concerns.

## Acceptance scenarios

| Scenario | SRD 5.1 | SRD 5.2.1 |
| --- | --- | --- |
| Surprised creature at combat start | Cannot act on its first turn | Acts; disadvantage on initiative |
| Spend inspiration on an attack | Advantage | Reroll the d20 |
| "Use an Object" action | Use an Object | Utilize (same `rule_key`, new label) |
| Attack with a weapon mastery property | No effect | Mastery applies |
| Melee vs prone + house flanking | Advantage, doesn't double | Same, on either base |

## Milestones

A milestone is finished when every criterion listed for it passes (ADR-0015). Criteria may be added
to a milestone as work reveals them; what is written here is what "done" means, not a schedule.

### M1 — Engine core

- `pnpm check` green.
- Golden tests for the attack and Bless scenarios, asserting outcomes separately from trace
  snapshots (NFR-4).
- Property tests for stacking (FR-11), roll-mode cancelling and rule ordering (FR-9).
- `explain()` answers why / why not by lookup over a stored trace, never by re-evaluating (FR-15).
- No `fs`, `Date.now()` or `Math.random()` anywhere in `packages/engine` (NFR-1, ADR-0002).

### M2 — Content, templates and diff

- `content/` holds the SRD 5.1 base, the SRD 5.2.1 base and the house-rule layer, each with its
  fact registry, licence and attribution (NFR-6).
- `pnpm content:lint` green: no unknown facts, duplicate keys, overrides of missing keys or missing
  citations (FR-17); every template renders with its defaults into a valid situation.
- `renderTemplate` (FR-18, FR-19), `diffOutcomes` and `diffTraces` (FR-16) implemented.
- A golden test for every template × profile (NFR-4).
- All five acceptance scenarios above produce their stated outcomes under both editions.

### M3 — Persistence

- Drizzle schema and migrations for every table in `architecture.md`.
- `pnpm db:seed` and `pnpm db:reset` rebuild the seeded rows from `content/` and `scenarios/` and
  leave user rows untouched; `pnpm db:reset --hard` observably differs (ADR-0004).
- A stored evaluation carries profile hash, seed, `engine_version` and `trace_schema_version` (VR-7).
- Seeding fails on a pack with no licence or attribution (NFR-6).

### M4 — Web

- Every route in `architecture.md` reachable on localhost via `pnpm i && pnpm db:reset && pnpm dev`
  (NFR-8).
- The trace viewer renders a stored trace as narrative text and exports it as JSON (NFR-7).
- `/compare` shows one situation under two profiles, aligned on step, phase and `rule_key` (FR-16).
- Scenarios can be created from a template, from a blank slate and by duplicating (FR-18).
- `/credits` renders from the `sources` table and is linked in the footer (NFR-6).
