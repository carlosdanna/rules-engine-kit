# Content authoring

All seeded content lives in `content/` as YAML and is validated by `pnpm content:lint`. The database is rebuilt from it; never edit seeded rows directly.

The shapes below are the *authoring* shapes. Several of them are shorter than the schema the engine
works in, and `packages/engine/src/content/` is the one place the two are reconciled — so anything
this document says an author may write is a case in `packages/engine/test/content/normalize.test.ts`,
and anything accepted there and not written down here is a shape only the loader knows about. A pack
can be run without a database at any point:

```sh
pnpm engine run --packs content/dnd5e-srd-5.2.1 --situation scenarios/melee-attack.json \
  --seed demo --narrative
```

## Where files live

```text
content/
  dnd5e-srd-5.1/        # a pack: any directory holding a pack.yaml
  dnd5e-srd-5.2.1/
  house-flanking-1.0.0/
  fixtures/*.yaml       # one fixture per file
  templates/*.yaml      # one template per file
```

`pnpm content:lint` takes the tree as `content/` by default, or any directories you name —
including a single pack, which is how you check one pack without the rest:

```sh
pnpm content:lint
pnpm content:lint content/dnd5e-srd-5.2.1
```

It reports everything it finds in one pass, each issue against the file it is in, and fails
on an error. A warning does not fail it: two rules sharing a phase and a priority still
order deterministically, by `rule_key`, but nobody chose that order (ADR-0009), which is
worth saying and not worth blocking a commit over.

## Rule pack

```text
content/dnd5e-srd-5.2.1/
  pack.yaml
  facts.yaml        # fact registry: every path a condition may read
  rules/*.yaml
```

`pack.yaml`:

```yaml
id: dnd5e-srd
version: 5.2.1          # semver; published versions are immutable
name: SRD 5.2.1         # what a reader sees in the profile picker
kind: base              # base | layer
extends: null           # for layers: { id: dnd5e-srd, range: "^5.2.0" }
license: CC-BY-4.0
sourceUrl: https://www.dndbeyond.com/srd
attribution: >-
  This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") ...
```

## Rule

```yaml
key: combat.surprise
op: override             # add | override | patch | disable
phase: modifiers         # one of the eight fixed phases; see below
priority: 100
description: Surprised creatures roll initiative with disadvantage.
condition: { "==": [{ "var": "actor.surprised" }, true] }
effects:
  - type: rollMode
    target: { kind: initiative, actor: $actor }
    mode: disadvantage
citation:
  source: srd-5.2.1
  section: "Rules Glossary > Surprise"
interpretation: null     # explain any reading of ambiguous wording
```

One rule per file under `rules/`, and `facts.yaml` is a sequence of fact definitions. Fields a rule
always has but rarely varies may be left out: `op` defaults to `add`, `label` to the rule key,
`priority` to `0`, `tags` and `effects` to empty, and `condition` and `interpretation` to `null` — an
omitted condition reads as "always applies once selected for its phase". On a fact, `derived`
defaults to `false`.

`phase` is one of `upkeep`, `declare`, `modifiers`, `roll`, `compare`, `damage`, `apply`, `expire`
(ADR-0012). There is no `initiative` phase — a rule that changes an initiative roll contributes to
the `initiative` roll *target* during `modifiers`, like every other roll.

`op: patch` may only change `priority`, `label`, `description`, `tags`, `citation` and
`interpretation`. Changing `phase`, `condition` or `effects` requires `override` (ADR-0009).

Conventions:

- `rule_key` is `domain.concept[.detail]`, lowercase, stable across versions. Renames keep the key and change `label`.
- One concept per rule; prefer several small rules over one with many effects.
- Citations point to SRD section paths, not page numbers.
- Only SRD 5.1 / 5.2.1 content. Paraphrase; don't paste long passages.
- A rule is written before any situation exists, so it names actors symbolically: `$actor` is
  whoever is taking the step, `$target` the action's target.

## Conditions

Conditions are JSON Logic *syntax*, evaluated by our own evaluator (ADR-0013). Only these
operators exist; anything else fails `content:lint`:

| Operator | Notes |
| --- | --- |
| `var` | reads a path registered in `facts.yaml`; an unregistered path is an error, never `null` |
| `all`, `any`, `not` | `all` short-circuits on its first false child and that child is what the trace reports as `failedAt` |
| `==`, `!=`, `<`, `<=`, `>`, `>=` | strict; no type coercion |
| `in` | set membership, e.g. `{ "in": ["prone", { "var": "target.conditions" }] }` |

Every `var` path must appear in the pack's `facts.yaml`. The lint and the evaluator walk the same
tree, so a path that lints cannot then be missing at run time.

## Effects

Three separate channels act on a roll, each with its own algorithm (ADR-0011):

```yaml
effects:
  # numeric — subject to stacking policy
  - type: addModifier
    target: { kind: attack, actor: $actor }
    value: { dice: 1d4 }           # a number, or dice rolled during `modifiers`
    modifierType: bless
    stackKey: bless
    policy: unique                 # sum | highest | unique

  # roll mode — advantage and disadvantage cancel, however many of each
  - type: rollMode
    target: { kind: attack, actor: $actor }
    mode: advantage

  # roll transform — acts on the dice pool BEFORE the keep, on one chosen die
  - type: rollTransform
    target: { kind: attack, actor: $actor }
    transform: { kind: reroll, keep: new }   # new | higher
    uses: 1
    dieSelector: intent            # intent | { fixed: <index> }
```

A dice value is written as notation — `{ dice: 1d4 }` — and may not carry a flat bonus: `1d4+2`
is rejected, because the `+2` would reach the roll without passing through the `addModifier`
channel and so could never have a stacking policy applied to it (FR-11). Write it as its own
modifier, which is also the only form the trace can explain.

`dieSelector: intent` reads `situation.intents.rollChoices[<rollId>].rerollDieIndex`, because both
SRDs leave the choice of which die to reroll to the player and ADR-0003 says choices are declared
up front. It defaults to die 0; `content:lint` warns when a profile can produce an `intent`
selector for which no choice is declared, since that default is a silent decision.

### Durations

Anything that lasts names an anchor turn and an edge, resolved against the timeline when the effect
is applied (ADR-0012):

```yaml
  - type: applyCondition
    actor: $target
    condition: blessed
    duration: { kind: rounds, rounds: 10, anchor: source, edge: end }
```

`anchor` is `source`, `target` or an explicit actor. `kind` is `instant`, `untilTurn`, `rounds` or
`permanent`; everything but `instant` and `permanent` needs an anchor and an edge, and
`content:lint` rejects one that has neither.

**Time spans are rounds.** A duration of *N* minutes is `rounds: N * 10`, `anchor: source`,
`edge: end` — it ends at the end of the source actor's turn in round `applied + rounds`. Neither
SRD states which edge a time span ends on, so **every rule using a time span must carry an
`interpretation` note saying so**, and so must any rule whose spell really has a Concentration
duration, since concentration is not simulated (ADR-0003).

## Fixture

```yaml
slug: goblin
kind: actor
rulesetScope: [srd-5.1, srd-5.2.1]   # split into two fixtures if stat blocks differ
data:
  name: Goblin
  ac: 15
  hp: 7
  proficiencyBonus: 2
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }
citation: { source: srd-5.2.1, section: "Monsters > Goblin" }
```

`kind` is `actor` or `item`. A fixture carries printed values only (FR-8): no effective AC,
attack bonus or save DC, because rules derive those and report the terms they came from.
`rulesetScope` needs at least one entry — a fixture no profile can see is content nothing
will ever render.

An item fixture carries what a rule can read. `mastery` is the SRD 5.2.1 weapon mastery property
and is `null` on a weapon scoped to 5.1, so one fixture can serve both editions and the difference
is whether a rule reads the field:

```yaml
slug: longsword
kind: item
rulesetScope: [srd-5.1, srd-5.2.1]
data:
  name: Longsword
  damage: { dice: 1d8, type: slashing }
  properties: [versatile]
  mastery: sap            # null under SRD 5.1
citation: { source: srd-5.2.1, section: "Equipment > Weapons" }
```

On an item, `damage`, `properties` and `mastery` may be left out and read as `null`, `[]`
and `null`. An actor's five fields are all required.

Fixtures are **inlined** into a situation when a template renders (ADR-0017): the rendered
situation holds the data, not the slug, so a saved scenario replays identically after a fixture is
corrected. Take a correction up by re-rendering the scenario from its template and params. There is
no per-scenario override mechanism — once the data is inlined, an override is an edited situation.

Where a stat block genuinely differs between editions, write two fixtures and scope each one.
That every profile in a template's `suggestedProfiles` resolves each slug to exactly one
variant is **not checked yet**: it needs `renderTemplate`, which is unwritten (Q24).

> Check stat values against the SRD before committing; the examples above are illustrative.

## Template

```yaml
id: melee-attack
name: Melee attack
tags: [combat, attack]
schemaVersion: 1
suggestedProfiles: [srd-5.1, srd-5.2.1]
params:
  attacker: { type: fixture, kind: actor, default: fighter-3 }
  target:   { type: fixture, kind: actor, default: goblin }
  weapon:   { type: fixture, kind: item,  default: longsword }
  targetConditions: { type: conditionList, default: [] }
  useInspiration: { type: boolean, default: false }
  rerollDie: { type: rollChoice, roll: attack, choice: rerollDieIndex, default: 0 }
skeleton:
  action: { type: attack, mode: melee, weapon: "{{weapon}}" }
  actors: ["{{attacker}}", { ref: "{{target}}", conditions: "{{targetConditions}}" }]
  intents:
    useInspiration: "{{useInspiration}}"
    rollChoices: { "{{$rollId(attack)}}": { rerollDieIndex: "{{rerollDie}}" } }
```

Param types: `fixture`, `number`, `boolean`, `enum`, `conditionList`, `rollChoice`. Anything more
complex is edited in the JSON tab.

A `rollChoice` param declares a per-roll player choice (ADR-0011). Roll ids are derivable from the
situation before it is evaluated, so the template can address one: `$rollId(attack)` expands to
`<stepId>/attack:<actorId>` for the step being rendered.

`tags` may be left out and reads as empty. An `enum` param's `default` must be one of its
`values`, which `content:lint` does check.

Every template must render with its defaults into a valid situation. `content:lint` does
**not** check this yet, nor that a `dieSelector: intent` has a declared choice behind it —
both need `renderTemplate` (Q24 in `docs/open-questions.md`). Until then a template is
checked against its schema alone.
