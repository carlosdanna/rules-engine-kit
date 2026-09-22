# ADR-0017: Templates inline fixture data; a situation carries no unresolved references

- Status: accepted
- Date: 2026-09-22

## Context

Q8 and Q9. `renderTemplate(template, params, fixtures) → Situation` (FR-18, FR-19) turns a template
and a set of fixture slugs into a situation, and Q8 asks whether the fixture data is inlined into
the result or whether the situation keeps references to be resolved later. Q9 asks the two questions
that follow from it: may a scenario override a fixture, and how are per-edition fixture variants
handled when a stat block differs between SRD 5.1 and 5.2.1?

Implementing the loop turned this from a preference into a blocker. `Situation.actors` already holds
inlined `Actor` records — printed abilities, AC, HP — but `Action.weapon` is a *fixture slug*, and
`createFactSource` can only hand a rule that slug as a string. No rule can reach the weapon's damage
dice, its properties, or its 5.2.1 mastery property, so the acceptance scenario "Attack with a weapon
mastery property — no effect on 5.1, mastery applies on 5.2.1" cannot be written at all. The
situation is already half inlined and half referential, and the referential half does not work.

## Options

1. **Keep references; resolve fixtures at evaluation time.** `evaluate(situation, profile, { facts,
   fixtures })` takes a fixture index the way it already takes a fact registry.
   - Pros: situations stay small; a corrected stat block reaches every saved scenario at once.
   - Cons: a stored scenario stops meaning one thing. Re-running last week's evaluation after a
     fixture edit silently produces a different outcome under the same seed and the same profile
     hash, and VR-7 records neither — the whole point of storing the seed, hash and engine version is
     that a replay is honest about what produced it.

2. **Inline everything at render time (recommended).** `renderTemplate` resolves every fixture slug
   into concrete data — actors and items alike — and `Situation` gains an `items` index so
   `action.weapon` has somewhere to point. The rendered situation is closed: no slug in it refers to
   a row outside it.
   - Pros: a saved scenario is reproducible on its own, which is what FR-3 and VR-8 are for; the
     engine keeps taking exactly one situation plus one profile; `action.weapon.*` becomes readable
     as ordinary registered facts.
   - Cons: a fixture correction does not propagate into saved scenarios, and situations get bigger.

3. **Inline actors, keep item references.** Today's accidental split, made deliberate.
   - Pros: no schema change.
   - Cons: it is the split that does not work. Either item data is reachable by rules or content has
     to hard-code per-weapon rule bodies, duplicating stat data the fixtures already hold.

## Decision

Option 2. A `Situation` is self-contained.

- `renderTemplate` resolves actor and item fixtures into concrete data.
- `Situation` gains `items: Record<slug, Item>`; `Action.weapon` stays a slug and indexes it, so a
  weapon used on twelve steps is stored once and `action.weapon` still reads as a slug for a rule
  that only wants to compare names.
- `Item` carries what a rule needs to read: `name`, `damage` (dice and type, nullable),
  `properties`, and `mastery` (null on a 5.1-scoped fixture). It carries no citation, for the same
  reason `Actor` carries none: the citation belongs to the fixture row, which is seeded content.
- **Q9, per-scenario overrides:** no mechanism. Once data is inlined an override is an edited
  situation, which the playground and the JSON tab already produce.
- **Q9, per-edition variants:** unchanged from `content-authoring.md` — a fixture declares
  `rulesetScope`, and stat blocks that genuinely differ are two fixtures. `content:lint` gains one
  rule: every profile in a template's `suggestedProfiles` must resolve each fixture slug to exactly
  one variant.

## Consequences

- `SITUATION_SCHEMA_VERSION` moves to 2. Free today — `packages/db` is a stub and no situation has
  been persisted — and this is the last moment it is.
- `Situation`'s validation gains one check, which is what makes "self-contained" a guarantee rather
  than a convention: an `action.weapon` slug with no entry in `items` is a schema error, exactly as
  an unknown `targetId` already is.
- `createFactSource` serves `action.weapon.*` from the index. Everything it exposes fits the
  `FactType` vocabulary a pack can register — `action.weapon.damage.dice` is the notation string
  (`1d8`), with `count` and `sides` separately for arithmetic.
- A fixture correction reaches a saved scenario only by re-rendering it, which `scenarios.template_id`
  and `scenarios.params` already make possible. That is the escape hatch, and it is explicit.
- One thing this does *not* settle, found while writing it: a damage rule can now **read** a weapon's
  dice, but `rollDice.expr` is a literal, so an effect still cannot use what it read. Logged as Q21;
  it blocks M2's damage content, not this decision.
