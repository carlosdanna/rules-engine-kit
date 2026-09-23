# ADR-0029: A user scenario is a row the app mints, and the app writes through server actions

- Status: accepted
- Date: 2026-09-23

## Context

ADR-0004 split seeded rows from user rows, ADR-0027 made a seeded row's primary key its slug, and
ADR-0028 made a file in `scenarios/` an envelope. None of them says how the *app* creates a
scenario, and until M4 nothing outside `packages/db/src/seed/seed.ts` had ever written to the
database. FR-18 needs three creation paths — blank slate, from a template, duplicate — and
ADR-0004 promises an export. Each raises a question no existing ADR answers, and no open
question had been raised for any of them:

1. **Identity.** `scenarios.id` is the slug, and `db:reset` re-inserts the seeded slugs on every
   run. ADR-0027 carves out a uuid only for `evaluations`. What is a user scenario's id?
2. **Duplicating.** A template-backed row stores the rendered situation *and* `template_id` +
   `params`. Does a copy keep the link?
3. **Export shape.** `ScenarioFile` has two forms. The template form requires `profile`, which
   ADR-0028 deliberately did not make a column. What does a stored row export as?
4. **How the app writes.** Server Actions or Route Handlers, and what is validated where.

## Options

1. **Identity.** (a) Slugify the name, editable, deduped with `-2`/`-3` against every existing
   id — readable, and a sensible export filename. (b) Same, not editable. (c) A random uuid, like
   `evaluations` — no collision logic, but `/scenarios/<uuid>` and `<uuid>.yaml` read badly for
   something meant to be promoted into `scenarios/`.
2. **Duplicating.** (a) Keep `template_id` + `params`, so the copy stays re-renderable. (b)
   Flatten to a literal. (c) Ask each time.
3. **Export shape.** (a) Always literal `{ slug, name, situation }`. (b) Template call with a
   profile chosen at export time. (c) Add a `render_profile` column.
4. **Writes.** (a) Server Actions taking typed object payloads, re-validating and re-rendering
   server-side. (b) Route Handlers with a JSON API.

## Decision

Options 1(a), 2(a), 3(a) and 4(a).

- **A user scenario's id is `uniqueSlug(slugify(name), everyExistingId)`**, shown in an editable
  field on creation and fixed thereafter (ADR-0027: a slug is never renamed in place). The
  namespace is shared with seeded rows on purpose — deduping against them is what stops a user
  row colliding with content a reset brings back. `slugify` and `uniqueSlug` live in
  `packages/db/src/slug.ts`.
- **A duplicate keeps `template_id` and `params`.** Re-rendering is ADR-0017's deliberate escape
  hatch for taking up a fixture correction; a copy without it would be strictly less useful than
  its original. Where the stored params no longer fit the template, the editor degrades to the
  stored situation, which is always still valid, and saving drops the link.
- **Export is always the literal form.** It needs no profile, it is closed over its content so a
  file exported today describes the same situation after `content/` moves on, and it round-trips
  through `ScenarioFile` and `loadScenarioDoc` unchanged — which
  `packages/db/test/content/serialize.test.ts` asserts. A template-form export would be a
  promise to re-render, which is exactly what a file you are about to commit must not be.
- **Writes go through Server Actions** in `apps/web/app/scenarios/actions.ts`, which are thin:
  the rules live in `apps/web/lib/scenarios/write.ts`, whose functions take the database as an
  argument so they are tested against an in-memory one. Payloads are typed objects, not
  `FormData`, because `resolveParams` checks without coercing. Every action validates with
  `ScenarioInput`, exported from `packages/db` beside `ScenarioFile` (`zod` does not resolve from
  `apps/web`), re-renders a template server-side from freshly read rows rather than trusting the
  browser's preview, and refuses a row with `origin = 'seed'` in the writer rather than only
  hiding the button.

## Consequences

- The engine gains a browser client: `/scenarios/new` renders its live preview with
  `renderTemplate` in the browser, which NFR-3 promised and nothing had exercised. Next dispatches
  Server Actions one at a time per client, so a server-rendered preview would have queued behind
  itself.
- A user scenario's `template_id` survives a reseed (ADR-0027's deterministic ids) but not its
  template leaving `content/`. `seedDatabase` now names the orphaned user scenarios and the
  remedy instead of surfacing the deferred check as a bare `FOREIGN KEY constraint failed`.
- A row stored under a superseded `SITUATION_SCHEMA_VERSION` is shown and exported but not
  editable until user scenarios can be migrated (VR-8, still unbuilt).
- The browser suite stays read-only: Playwright runs against `data/app.db` with no isolation and
  `db:reset` does not remove user rows, so create/edit/delete are covered by Vitest instead.
- `openDb` sets `busy_timeout`, since the app is now a writer alongside `db:seed`.
