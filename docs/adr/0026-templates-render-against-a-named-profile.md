# ADR-0026: A profile is a named, seeded stack; a template renders against one

- Status: accepted
- Date: 2026-09-22

## Context

Q24. Three checks `docs/content-authoring.md` promises are not performed — every template
renders with its defaults into a valid `Situation`, every `suggestedProfiles` entry resolves
each fixture slug to exactly one variant (ADR-0017), and a `dieSelector: intent` whose roll has
no declared choice is warned about — because `renderTemplate` is unwritten. ADR-0017 fixed its
contract, `architecture.md` printed its signature, and the open question recorded what writing
it would still have to decide:

> what a `suggestedProfiles` string maps to — no pack declares the ids `srd-5.1` and `srd-5.2.1`
> that templates and fixtures both use — and what type indexes a fixture slug to one variant
> under a profile.

Authoring the six starter templates turned up two more, neither of which was visible before
there was a template to write. **The documented skeleton is not a `Situation`**: it has a bare
`action:`, an `actors:` list of `{ ref, conditions }`, no `timeline`, no step ids, and none of
the `targetId` / `rangeFt` that `Action` requires. Two of the starter templates — combat start
and buffed round — need several steps across several rounds, which that shape cannot express at
all. And **Bless has nowhere to live as a fixture**: ADR-0024 closed the kinds at `actor` and
`item`, and Bless is already `spell.bless.cast` / `.attack` / `.save` plus a `blessed`
condition, so a template that wants it wants a `cast` step, not a slug.

## Options

### What a profile id names

1. **A seeded profile manifest (recommended).** `content/profiles.yaml` declares a slug, a name
   and an ordered layer stack.
   - Pros: it is the `profiles` / `profile_layers` tables `architecture.md` already seeds, moved
     one step earlier into the content tree; a profile can be a *stack*, so the house-rule layer
     is nameable and `suggestedProfiles: [srd-5.2.1+flanking]` means something; `/profiles`
     browses seeded rows rather than inventing them.
   - Cons: one more file in `content/`, and one more thing `content:lint` must check.
2. **An alias field on `pack.yaml`.** Each pack declares `profileId: srd-5.1`.
   - Pros: no new file.
   - Cons: a profile is then always exactly one pack. A layered profile could never be
     suggested, which is the demo's whole subject.
3. **Parse the id by convention** — `srd-5.1` is pack `dnd5e-srd` at `5.1.x`.
   - Cons: the mapping lives in code, matches by string surgery, and breaks silently when a pack
     is renamed. Content that references content should say so in content.

### What the skeleton is

1. **Situation-shaped, minus what the renderer supplies (recommended).** The skeleton carries
   `actors` — each naming a fixture param plus the `id`, `hpCurrent` and `conditions` that
   `schema/fixture.ts` already says come from the template — and an explicit `timeline`.
   `renderTemplate` supplies `schemaVersion`, `items` and the fixture's printed data.
   - Pros: a multi-step template is expressible; the skeleton reads like the thing it produces;
     one vocabulary to document, lint and learn.
   - Cons: the documented example is replaced, and a one-step template is a few lines longer.
2. **Keep the shorthand and add an escape hatch** for multi-step templates.
   - Cons: two dialects. Everything that reads a skeleton — the renderer, the lint, the form
     generator in M4 — has to handle both, and an author has to know which one they are in.
3. **A full literal `Situation` with holes.**
   - Cons: every template would repeat the printed stat values that fixtures exist to hold, and
     correcting a stat block would mean editing the templates.

## Decision

Options 1 and 1.

- **`content/profiles.yaml`** declares the profiles. A profile slug is what `suggestedProfiles`,
  a fixture's `rulesetScope` and a citation's `source` name; `content:lint` reports a string that
  is not a declared slug, and a layer entry that names no pack in the tree.
- **`renderTemplate(template, params, index, profileSlug): Situation`**, pure and in
  `packages/engine/src/templates/`. `FixtureIndex` is the type Q24 asked for: it answers
  `(slug, kind, profileSlug) → Fixture`, and a slug resolving to zero or to more than one variant
  under a profile is the error ADR-0017 asked `content:lint` to report.
- **The skeleton is Situation-shaped.** `{{param}}` substitutes a param's value; a string that is
  exactly `"{{name}}"` becomes the value itself, so a `conditionList` yields an array rather than
  a string. `{{$rollId(<stepId>, <kind>)}}` expands to `` `${stepId}/${kind}:${actorId}` `` using
  the named step's own `actorId`, minted through `src/dice/rollId.ts` so the format has one
  definition. An unresolvable placeholder is an error, never a passthrough.
- **A fixture may carry an `interpretation`**, like a rule, for a stat block the SRD does not
  print whole. `fighter-3` is the case that forces it: both SRDs publish the Fighter class tables
  but neither publishes a third-level fighter, so the ability array, the armour and the weapon
  are this repository's choices and have to say so where the numbers are.
- **Bless stays content, not a fixture.** ADR-0024 is not reopened. The buffed-round template is
  a `cast` step followed by attacks, which is also the only shape that exercises the duration.

## Consequences

- `content/profiles.yaml` is seeded content: `packages/db/src/content` reads it, `lintContent`
  checks it, and M3's `profiles` and `profile_layers` rows come from it rather than from a
  migration's hand-written insert.
- The three checks Q24 records are performed, so `content-authoring.md` loses its three
  "not checked yet" caveats and Q24 leaves `open-questions.md`. The `dieSelector: intent` check
  is a **warning**: `schema/effect.ts` says the selector defaults to die 0, which is a silent
  decision rather than a broken one.
- `Fixture` gains `interpretation`, defaulting to `null` in the normaliser exactly as a rule's
  does. `FIXTURE` rows in M3 carry it.
- `TEMPLATE_SCHEMA_VERSION` stays at 1. Nothing has been persisted and no template ships today,
  so 1 still describes the first shape anyone will ever author.
- `docs/content-authoring.md` § Template is rewritten, and the one authored template in the repo
  (`packages/db/test/fixtures/content-ok/templates/melee-attack.yaml`) is rewritten with it.
- `packages/engine/cli.ts` gains `loadFixtures`, `loadTemplates` and `loadProfiles` beside
  `loadPacks`, because the golden harness renders and `packages/engine` may not import
  `packages/db` (ADR-0020). `packages/db/test/content/parity.test.ts` grows to hold the two
  walkers to the same answer on all four kinds of document, not just packs.
- A golden case may now be `{ template, params }` rather than a literal situation, which is what
  makes NFR-4's "a golden test for every template × profile" affordable: twelve cases are twelve
  four-line files plus the hand-derived outcome each one is actually about.
