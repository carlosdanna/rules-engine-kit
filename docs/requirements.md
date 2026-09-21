# Requirements

A localhost-only demo of a deterministic, explainable, versioned rules engine. D&D 5e SRD content is the example domain.

## Core concepts

| Term | Meaning |
| --- | --- |
| Situation | Immutable input: actors, their state, the action(s) being resolved, `intents`, time (round/turn) |
| Fact | Typed value the engine can read or derive, registered in the pack's fact registry |
| Rule | `rule_key`, phase, priority, condition (JSON Logic), effects, citation, optional interpretation |
| Effect | set value · add modifier · roll mode · roll dice · apply/remove condition · emit event · halt |
| Phase | Fixed resolution stage, e.g. `declare → modifiers → roll → compare → damage → apply → expire` |
| Ruleset version | Immutable, semver-tagged collection of rules (base or layer) |
| Layer | Ruleset that adds, overrides, patches or disables rules of its base |
| Profile | Ordered stack of ruleset versions resolved into one rule list with a hash |
| Outcome | Final state, derived values, emitted events |
| Trace | Ordered log of rules considered/fired/skipped, facts read, rolls, state deltas |

## Scope: core subset

| Engine feature | Content that exercises it |
| --- | --- |
| Phases & d20 resolution | Attack vs AC, ability check vs DC, saving throw |
| Advantage/disadvantage cancelling | Prone, restrained, invisible, poisoned |
| Modifier stacking policies | Proficiency, ability modifier, Bless, cover |
| Damage pipeline | Damage dice, crits, resistance/vulnerability |
| Durations | Effects expiring at start/end of a turn, Bless over rounds |
| Versioned layers (5.1 vs 5.2.1) | Surprise, Inspiration vs Heroic Inspiration, one weapon mastery |
| House-rule layer | Flanking grants advantage |

Out of scope: reactions/interrupts, spells beyond Bless, movement/grids, classes and character building, forward chaining, pausing for player input.

## Functional requirements

- **FR-1** Validate situations against a versioned Zod schema.
- **FR-2** Accept an explicit profile (ordered ruleset versions).
- **FR-3** Return outcome + trace; never mutate input.
- **FR-5** Rules carry id/key, version, description, citation, phase, priority, tags, condition, effects.
- **FR-6** Conditions: all/any/not, comparisons, set membership, references to registered facts.
- **FR-7** Effects as listed in Core concepts, implemented through an effect registry.
- **FR-9** Phases run in fixed order; within a phase, priority then `rule_key` for stable ordering.
- **FR-11** Stacking policies per modifier type: sum, highest-only, same-`stackKey`-doesn't-stack, advantage/disadvantage cancel.
- **FR-12** Conflicts resolved by explicit `override` or layer order; unresolved conflicts are reported.
- **FR-13** Seeded RNG, seed recorded in outcome; dice results can be forced.
- **FR-14** Trace per rule: status, facts read with values, state delta, citation.
- **FR-15** "Why / why not" explanation for any rule in a run.
- **FR-16** Evaluate one situation under two profiles and diff outcomes and traces.
- **FR-17** Lint on load: unknown facts, duplicate keys, overrides of missing keys, missing citations.
- **FR-18** Create situations from a template, from a blank slate, or by duplicating a scenario.
- **FR-19** Templates declare typed params; the UI generates a form from them.

## Versioning requirements

- **VR-1** Published ruleset versions are immutable; changes create a new semver version.
- **VR-2** Layers can `add`, `override`, `patch` or `disable` rules by `rule_key`.
- **VR-3** Layers declare base and compatible range; incompatible stacks fail at resolve time.
- **VR-4** Layer order is explicit, last wins; the trace shows which layer supplied each rule.
- **VR-7** Evaluations store profile hash, seed, `engine_version`, `trace_schema_version`.
- **VR-8** Situation schema is versioned; saved user scenarios can be migrated.
- **VR-9** Diff rules between two ruleset versions.

Deferred: VR-5 (select profile by campaign/date), VR-6 (effective dates) — see `open-questions.md`.

## Non-functional requirements

- **NFR-1** Determinism: pure engine core, no I/O, clock or global randomness.
- **NFR-3** Engine runs in Node and the browser.
- **NFR-4** Golden tests for every template × profile; property tests for stacking and ordering.
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
