# ADR-0032: A template scenario can be detached into a literal one

- Status: accepted
- Date: 2026-09-24

## Context

A template exposes only the params it declares (FR-19), so a scenario made from one has the
template's shape: the `melee-attack` template always has two actors and one attack step. Anyone who
wanted a third creature or a second round had to retype the rendered situation as JSON into a
blank-slate scenario, and the blank-slate form covered only actor stats and who acts when.

ADR-0029 decided that a duplicate *keeps* its template link, because a linked scenario can take
up a fixture correction by re-rendering (ADR-0017). Nothing said whether a person may give that
link up on purpose, in exchange for being able to change the scenario's structure.

## Options

1. **Detach on request.** The editor offers "Customize further" on a template scenario. It turns
   the last good render into the literal text and saves as `kind: 'literal'`, so
   `template_id` and `params` become `null`. This needs no schema or write-path change; the
   literal arm of `ScenarioBody` already exists, and an update already clears the link.
2. **Let templates declare open structure** (repeatable actor lists, optional steps). This keeps
   the link, but it is a new param vocabulary, a template `schemaVersion` bump and a lint
   surface, all to anticipate edits nobody can list in advance.
3. **Status quo.** Hand-copy the JSON.

## Decision

Option 1. Detaching is explicit: the editor explains what is lost before it switches. It is
one-way within an editing session. Duplicating (ADR-0029) still keeps the link; detaching is a
separate, deliberate step.

The literal form gains fixture pickers: "Add actor from fixture" and "Add weapon from fixture",
plus a guided blank slate that starts from chosen actor fixtures. These copy a fixture in with
the same `actorFromFixture` / `itemFromFixture` functions `renderTemplate` uses, so a stat block
added by hand is identical to one a template would have inlined. The profile these pickers
resolve against is a UI choice and is not stored, in the same way ADR-0028 treats a template's
render profile.

## Consequences

- A detached scenario shows as "written by hand" on `/scenarios` and no longer takes up fixture
  corrections by re-rendering. This is the trade the editor warns about.
- `packages/engine` exports `actorFromFixture` and `itemFromFixture`. `renderTemplate` calls
  them, so its output and the golden snapshots are unchanged.
- The form's edits live as pure functions in `apps/web/lib/scenarios/situation-edits.ts`. Each
  one returns a situation that parses (removing an actor clears actions aimed at it, and
  removing a weapon leaves attacks unarmed), so the form never loses what it renders.
- `intents.rollChoices` is still edited in the JSON tab: its keys are roll ids, which depend on
  the step and actor ids being edited alongside them.
