# ADR-0027: A seeded row's identity is its content, and a pack version's content is immutable

- Status: accepted
- Date: 2026-09-22

## Context

M3 builds the tables `architecture.md` has specified since the start, and three questions the
table alone does not answer surface the moment anything is written to them.

**What is a row's primary key?** ADR-0004 says `db:seed` and `db:reset` rebuild the seeded rows
from `content/` while user rows are left alone — so a seeded row is *deleted and written again*
on every reset, while a user `evaluation` written between two resets still points at the
`scenario` it ran. With autoincrement keys that evaluation is orphaned by the next reset, and
"reseeding twice yields identical rows" becomes a claim about insert order rather than about
content.

**What is `ruleset_versions.content_hash`?** The column is listed and nothing says what it is
taken over, or what the database should do when it changes. VR-1 says a ruleset version is
immutable; nothing enforces it, because until now nothing stored one.

**Where does a source belong?** The table puts `source_id` on `rulesets`, but a ruleset is a
slug across versions — `dnd5e-srd` is 5.1.0 *and* 5.2.1 — and those two versions share neither
`sourceUrl` nor `attribution`. `CREDITS.md` already lists them as two sources, correctly. One
`source_id` per ruleset slug can hold only one of them, so `/credits` (NFR-6) would attribute
one edition to the other's URL.

## Options

### Row identity

1. **Deterministic text keys derived from natural keys (recommended).** `dnd5e-srd@5.2.1`,
   `dnd5e-srd@5.2.1#condition.prone.attacked`.
   - Pros: reseeding is idempotent by construction, not by care; a user row's foreign key
     survives a rebuild because the parent comes back under the same id; a failing test names
     the row it means. The keys are the ids the content already uses, so nothing new is invented.
   - Cons: wider keys than integers, and a slug can never be renamed in place — a rename is a
     delete plus an insert, which for seeded content is exactly right.
2. **Autoincrement integers with unique natural-key indexes.** Idiomatic SQL; the app never
   sees the natural key.
   - Cons: the rebuild has to preserve ids to keep user foreign keys, which means an
     upsert-and-sweep rather than a rebuild — the thing ADR-0004 says `db:reset` is not.
3. **Hashes of the row content.** Maximally content-addressed.
   - Cons: unreadable in a query, and a corrected typo in a rule's label changes the rule's id,
     so every evaluation that cited it dangles for no semantic reason.

### The content hash

1. **`sha256Hex(canonicalJson(<the normalised RulesetVersion>))` (recommended).** The identity,
   the fact registry and the authored rule entries, in the canonical spelling
   `packages/engine/src/resolver/canonical.ts` already defines.
   - Pros: one definition of "canonical" in the repository. `resolver/index.ts`'s module comment
     already says `canonicalJson` and `sha256Hex` are exported for this caller.
   - Cons: a comment-only edit to a YAML file does not change the hash, and a whitespace-only
     edit to a rule's `description` does. Both are right: the hash is over what was loaded, not
     over the bytes.
2. **A hash of the pack's files.** Simple to explain.
   - Cons: reformatting a YAML file would report the rules as changed, and two trees that mean
     the same thing would disagree.

### What a changed hash does

1. **`db:seed` fails; `db:reset` rebuilds (recommended).**
2. Warn and overwrite — VR-1 then means nothing.
3. Fail in both — there would be no way to develop content, since every content edit before the
   first release would need a semver bump.

## Decision

Options 1, 1 and 1.

- **Every seeded row has a deterministic text primary key**, derived from the natural key the
  content already carries: `sources` and `ruleset_versions` are `<packId>@<semver>`, `rulesets`
  is the pack id, `rules` is `<versionId>#<ruleKey>`, `templates` is the template id, `profiles`
  is the profile slug, `scenarios` is the scenario slug, and `profile_layers` is keyed by
  `(profile_id, position)`. `evaluations.id` is a random uuid, because it is a user row written
  at runtime and has no natural key.
- **A fixture's key includes its scope**: `<kind>:<slug>:<rulesetScope joined by +>`. `goblin` is
  two actor fixtures, one scoped to `srd-5.1` and one to `srd-5.2.1` — ADR-0026 made that the
  supported way to say a stat block differs between editions, so the slug alone is not a key.
- **`ruleset_versions.content_hash` is `sha256Hex(canonicalJson(pack))`** over the normalised
  `RulesetVersion`, and `db:seed` **refuses** to re-seed a `(ruleset, semver)` already in the
  database under a different hash. The message names the pack, the version and both hashes; the
  fix is to bump the semver (VR-1), and `db:reset` is the development escape hatch because it
  rebuilds the seeded rows rather than comparing them.
- **`source_id` moves from `rulesets` to `ruleset_versions`.** Licence, URL and attribution are
  properties of an edition, not of a slug.

## Consequences

- `architecture.md`'s Data model table is edited: `source_id` leaves the `rulesets` row and joins
  the `ruleset_versions` row, and the table gains a note about deterministic ids.
- `db:seed` and `db:reset` share one `seedDatabase`, which deletes the seeded rows and writes them
  again inside a single transaction with `PRAGMA defer_foreign_keys = ON`. Deferring is what lets
  a user `evaluation` keep its `scenario_id` across the rebuild: the parent is gone and back
  before the commit that checks it. `db:seed` runs the hash guard first; `db:reset` does not.
- "Reseeding twice yields identical rows" is testable as a dump-and-compare of every table, which
  is the test `packages/db/test/seed/idempotent.test.ts` performs.
- `db:reset --hard` keeps its meaning from ADR-0004 and now has an observable difference to
  assert: it deletes user rows, which `db:reset` does not.
- Nothing in `packages/engine` changes. The hash is computed in `packages/db` from functions the
  engine already exports, and no stored `profile_hash` (VR-7) is affected: that is the hash of
  the *resolved* profile (ADR-0009) and is a different number for a different purpose.
