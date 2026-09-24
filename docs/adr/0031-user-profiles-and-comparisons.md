# ADR-0031: A user profile is a row the app mints, and a comparison is a URL

- Status: accepted
- Date: 2026-09-24

## Context

M4's `/profiles` builds profiles by ordering ruleset versions, and `/compare` runs one scenario
under two of them (FR-2, FR-12, FR-16). ADR-0004 already says `profiles` is shared between seed
and user, and ADR-0030 says a run rebuilds its profile from rows. Building the two pages raised
questions none of them answers:

1. **Identity.** What is a user profile's id? Seeded slugs (`srd-5.2.1+flanking`) are authored
   in `content/profiles.yaml` and are not `slugify`-shaped.
2. **Conflicts.** `resolveProfile` returns conflicts (a duplicate `add`, a priority tie) rather
   than refusing. Should a profile with conflicts be saved?
3. **Deleting.** `evaluations.profile_id` references the profile.
4. **Reseeding.** `deleteSeeded` cleared `profile_layers` wholesale, which would have emptied
   every user profile on the next `db:reset`. A user profile's layers point at seeded
   `ruleset_versions`, whose rules a reseed may change, so its stored `resolved_hash` can go
   stale. The refusal a stale hash produces names `pnpm db:reset` as the remedy.
5. **Storing a comparison.** Two runs, or none?

## Decision

- **A user profile's id is `uniqueSlug(slugify(name), everyProfileId)`**, editable on creation
  and fixed thereafter, as for a user scenario (ADR-0029). `isValidSlug` is enforced, so a user
  slug never contains the `.` or `+` a seeded one may.
- **A stack that resolves is saved with its conflicts**, which `/profiles` lists beside it. Each
  one names something an author may have meant, and the resolver's contract is to report rather
  than choose (ADR-0009). Only an `IncompatibleStackError` blocks a save (VR-3). The server
  resolves the stack again from rows; the browser's preview is never trusted.
- **A user profile with stored runs cannot be deleted**, as a scenario cannot (ADR-0030). A
  seeded one cannot be deleted at all.
- **A reseed keeps user profiles' layers and takes their hash again.** `deleteSeeded` deletes
  only seeded profiles' layers; after the rebuild, each user profile is resolved from its layers
  and its `resolved_hash` updated, so `pnpm db:reset` does fix a stale user profile. A stack the
  new content makes incompatible keeps its old hash — runs under it are refused and `/profiles`
  shows why — rather than failing the reseed. A layer naming a version `content/` no longer
  declares fails the reseed by name, and nothing changes.
- **`/compare` stores nothing.** Its inputs are the query string (`?scenario&a&b&seed`), both
  sides are evaluated on the server exactly as `/playground` evaluates (ADR-0030, including the
  stale-hash refusal), and the page is a function of its URL. It defaults to `srd-5.1` against
  `srd-5.2.1`.

## Consequences

- `loadStack` in `packages/db/src/profile.ts` rebuilds any list of versions, in the order
  given, so the builder can preview an unsaved and possibly incompatible stack.
- `diffOutcomes`, `diffTraces` and `diffRulesets` live in `packages/engine/src/diff/`. Replay
  now reports a diff rather than only the first divergent event.
- A seeded profile added to `content/profiles.yaml` later could take a slug a user row already
  holds; like scenarios (ADR-0029), the seed would then fail on the primary key. Seeded slugs
  carry a `.` in practice, which user slugs cannot.
