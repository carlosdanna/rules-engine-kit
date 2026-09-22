# ADR-0016: Ruleset identity is semver alone; profiles are always chosen explicitly

- Status: accepted
- Date: 2026-09-22

## Context

Q7 and Q11, which are the same question asked from two ends. Q7 asks whether a ruleset version is
identified by semver alone or by semver plus an effective date (VR-6). Q11 asks whether VR-5 —
selecting a profile by criteria such as campaign or date — is in the demo. A dated version is only
useful if something selects by date, and a criteria-based selector needs something to select on, so
answering one without the other leaves a half-built feature.

Both are listed in `requirements.md` as deferred. The question now is whether to close them or build
them, and the engine is the wrong place to look for the answer: FR-2 says `evaluate` is given an
explicit, ordered profile, and `resolveProfile` never consults anything but the layers handed to it.

## Options

1. **Both in.** Ruleset versions carry `effectiveFrom`; a selector resolves a profile from criteria.
   - Pros: closest to a real product, where "which rules were in force in March" is a genuine question.
   - Cons: a second way to obtain a profile, which every consumer must then handle — `/compare` has
     to say which two profiles it compared and how they were chosen, and a stored evaluation has to
     record the criteria as well as the hash or it cannot be replayed. None of the five acceptance
     scenarios exercises it.

2. **Effective dates in, selection out.** Versions carry a date, displayed in `/rulesets`.
   - Pros: cheap; a content field and a lint rule.
   - Cons: a field nothing reads. The date would be decorative, and a decorative field in seeded
     content is one more thing `content:lint` must check and one more thing to get wrong.

3. **Both out (recommended).** Semver identifies a ruleset version; a profile is an explicit ordered
   stack, chosen by the user in `/profiles` or named by a template's `suggestedProfiles`.
   - Pros: one way to get a profile, which is the way FR-2 already describes; nothing in the demo's
     scope loses a feature; the versioning story stays about *layers*, which is what makes the
     5.1-vs-5.2.1 comparison interesting.
   - Cons: the demo cannot answer "which ruleset applied on a date", which a viewer might expect of
     something that calls itself a versioned rules engine.

## Decision

Option 3. VR-5 and VR-6 are closed as out of scope for this demo rather than deferred indefinitely.
A ruleset version is identified by `(id, semver)`; a profile is an explicit ordered stack of them.

## Consequences

- `requirements.md` moves VR-5 and VR-6 from "Deferred — see open-questions.md" to closed by this
  ADR, so a reader is told they will not arrive rather than that they are pending.
- Reopening is cheap, and this is the load-bearing reason the decision is safe: the profile hash is
  the canonical JSON of `{ rules, sources }` and `sources` is `{ layer, version }` per layer
  (`packages/engine/src/resolver/resolveProfile.ts`). An `effectiveFrom` added to `RulesetVersion`
  later would not enter the hash, so no stored evaluation's `profile_hash` (VR-7) is invalidated by
  changing this decision.
- Selection by criteria, if it ever arrives, belongs in `packages/db` or the app and not in the
  engine: it produces a profile, and the engine's contract starts once a profile exists.
- `/profiles` is a stack editor, not a search. The route's purpose in `architecture.md` — order
  layers, see hash and conflicts — is unchanged and now complete.
