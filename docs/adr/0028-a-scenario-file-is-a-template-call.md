# ADR-0028: A scenario file is a template call; packs name their author and templates describe themselves

- Status: accepted
- Date: 2026-09-22

## Context

`scenarios/` is referenced by `architecture.md`, by `content-authoring.md`'s worked example and by
M3's exit criterion — `db:seed` rebuilds the seeded rows from `content/` *and* `scenarios/` — and
it does not exist. `open-questions.md` records that accurately: populating it is work not yet done
rather than a question, and rendering the six starter templates is the obvious way to do it. But
"render them" is not yet a decision about what a file in that directory *is*, and the `scenarios`
table wants `slug`, `name`, `situation`, `template_id`, `params`, `origin` and `schema_version`,
which a bare `Situation` JSON carries none of.

Two smaller gaps surface from the same table. `sources` wants an `author` and `pack.yaml` declares
none — it has `name`, `license`, `sourceUrl` and `attribution`, and "Wizards of the Coast LLC"
appears only inside the prose of the attribution text. And `templates` wants a `description` that
the `Template` schema has no field for, so `/templates` in M4 would list six names with nothing
under them.

## Options

### What a file in `scenarios/` is

1. **A bare `Situation`.** What `content-authoring.md`'s example implies today.
   - Pros: `pnpm engine run --situation scenarios/melee-attack.json` needs no change.
   - Cons: no slug, no name, and no `template_id` / `params` — so the seeded row cannot record
     what it was rendered from, and ADR-0017's "take a correction up by re-rendering the scenario
     from its template and params" has nothing to re-render from. The six files would also be
     several hundred lines of inlined stat blocks that go stale the moment a fixture is corrected.
2. **An envelope naming a template call (recommended).** `{ slug, name, profile, template, params }`,
   with a literal `situation` as the alternative to `template`.
   - Pros: four lines per starter scenario, and they cannot go stale — the situation is rendered
     from the same `renderTemplate` the golden cases use, so a template change fails a test rather
     than leaving a stale copy in `scenarios/`. The literal form is what an exported user scenario
     (ADR-0004) comes back as, and what a blank-slate scenario (FR-18) is.
   - Cons: `cli.ts --situation` has to accept two shapes, and the file is no longer something
     another tool can read as a situation without knowing the convention.
3. **Both: an envelope plus a committed rendered situation beside it.**
   - Cons: two sources of truth for the same situation, and nothing but a test to hold them
     together. The test is the thing option 2 gets for free.

### Where `author` comes from

1. **A required field on `pack.yaml` (recommended).** Stated once, where the licence and the
   attribution already are.
2. Parse it out of the attribution text — string surgery over prose, per licence.
3. Drop the column — `/credits` then renders attribution paragraphs with no attributable party in
   any structured field, and cannot group or sort by author.

## Decision

Options 2 and 1.

- **A file in `scenarios/` is an envelope**: `{ slug, name, profile, template?, params?, situation? }`
  with exactly one of `template` and `situation`. `profile` is a *render input* — the profile slug
  the template is rendered against (ADR-0026), which is what picks a fixture variant — and is
  deliberately **not** a stored column: a saved scenario is run against whichever profile the user
  picks, and storing one would suggest otherwise. `params` is stored beside `template_id`, so a
  fixture correction is taken up by re-rendering (ADR-0017).
- **The six starter scenarios are template calls**, one per template in `content/templates/`, at
  its defaults and under the first profile it suggests.
- **`packages/engine/cli.ts --situation` accepts either shape**: a document with a `situation` key
  is an envelope, anything else is parsed as a `Situation`. The loader is outside the purity
  boundary (ADR-0020), so this is `cli.ts`'s to know, not `src/`'s.
- **`pack.yaml` gains a required `author`**, with no default in the normaliser — an unattributed
  pack should fail to parse, exactly as one with no licence does (NFR-6).
- **`Template` gains a required `description`**, and `TEMPLATE_SCHEMA_VERSION` goes to 2.

## Consequences

- `scenarios/` exists, with six files and a README. `packages/db/src/content/scenarios.ts` reads it;
  `loadContentTree` gains `profiles` and `scenarios` beside `packs`, `fixtures` and `templates`,
  because the seeder needs all five and there is no second place to get them.
- `content-authoring.md` gains a § Scenario, and its `pnpm engine run` example keeps working.
- The three `content/**/pack.yaml` files, the pack fixtures under `packages/db/test/fixtures/` and
  the golden harness's pack all gain an `author`; the six templates gain a `description` and
  `schemaVersion: 2`.
- `content:lint` gains a `missing-author` code beside `missing-license` and `missing-attribution`,
  which was not the intention and is forced by how the lint already works: it reports those two by
  name *before* the manifest parse and then fills them with a placeholder, so that one missing line
  does not hide the rest of the pack's mistakes. A required field with no such treatment would do
  exactly that — a pack with no `author` would report nothing about its rules at all. So `author`
  is named the same way, and `packages/db/test/content/lint.test.ts`'s "does not let a missing
  licence hide the rest of the pack below it" is the test that says why.
- Bumping `TEMPLATE_SCHEMA_VERSION` costs nothing *today* and would cost a migration tomorrow: no
  `templates` row has ever been written, and this is the last moment that is true.
- `open-questions.md` loses its `scenarios/ does not exist` paragraph.
