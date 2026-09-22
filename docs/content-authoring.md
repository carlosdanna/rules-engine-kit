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
  profiles.yaml         # the named profiles everything else refers to
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

## Profiles

A pack identifies itself as `(id, semver)`, but a template's `suggestedProfiles`, a fixture's
`rulesetScope` and a citation's `source` all name a **profile**: an ordered stack, base first,
that resolves into one rule list and one hash. `profiles.yaml` declares them (ADR-0026), which
is what lets `content:lint` report a typo in one instead of leaving a fixture silently
invisible:

```yaml
- slug: srd-5.2.1
  name: SRD 5.2.1
  layers: [{ id: dnd5e-srd, version: 5.2.1 }]

- slug: srd-5.2.1+flanking
  name: SRD 5.2.1 + house flanking
  layers:
    - { id: dnd5e-srd, version: 5.2.1 }
    - { id: house-flanking, version: 1.0.0 }
```

A slug is a name, not an identity: the profile hash is the canonical JSON of the *resolved*
rules plus the layer identities (ADR-0009), so renaming one does not invalidate a stored
evaluation. Every layer must name a pack the tree holds, and every string elsewhere that names
a profile must be a declared slug — both are `content:lint` errors.

`pnpm content:lint <one-pack>` is handed a pack directory and never sees a `profiles.yaml`, so
a tree that declares none simply has nothing to check the slugs against.

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
omitted condition reads as "always applies once selected for its phase". On a fact, `derived` and
`nullable` default to `false`.

A fact is parsed through the type it declares, so a path whose value is legitimately absent —
an item's `mastery` on a weapon scoped to 5.1, a `check` with no skill — must say so:

```yaml
- path: action.weapon.mastery
  type: string
  nullable: true          # only a nullable fact may read `null` (ADR-0022)
  description: the SRD 5.2.1 mastery property; null on a weapon scoped to 5.1
```

Everything else keeps ADR-0013's strictness: a non-nullable fact reading `null` is an error, not
a silently skipped rule. `==` and `!=` accept a `null` literal on the other side; `<`, `in` and
the rest still refuse one, because ordering or set-testing an absent value is a content bug.

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

Four separate channels act on a roll or on its damage, each with its own algorithm
(ADR-0011, ADR-0025):

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

  # damage scale — multiplicative, applied after the modifiers above are summed
  - type: scaleDamage
    target: { kind: damage, actor: $actor }
    scale: resistance              # resistance | vulnerability
```

A scale names *which way* the damage total bends and nothing else. The arithmetic is the
engine's, because it is the part both SRDs state exactly: resistance halves (rounding down),
then vulnerability doubles, and multiple rules granting the same scale count as one. The two
do not cancel — a creature with both takes 8 from 9 damage, not 9 — so write the two rules
independently and let the channel compose them.

`scaleDamage` targets a damage roll, never a derived path: there is no halving an effective
AC. A rule decides *whether* the scale applies, which is where the content lives:

```yaml
condition:
  all:
    - { "==": [{ "var": "step.attack.result" }, "hit"] }
    - { "in": [{ "var": "action.weapon.damage.type" }, { "var": "target.resistances" }] }
```

A dice value is written as notation — `{ dice: 1d4 }` — and may not carry a flat bonus: `1d4+2`
is rejected, because the `+2` would reach the roll without passing through the `addModifier`
channel and so could never have a stacking policy applied to it (FR-11). Write it as its own
modifier, which is also the only form the trace can explain.

### Values read from a fact

A value may name a registered fact instead of a number, and the engine reads it when the
effect is applied (ADR-0021). That is how a pack states what the SRD states — "an attack
adds the ability modifier used to make it" — without the rule knowing which fixture it will
run against (FR-8):

```yaml
effects:
  - type: addModifier
    target: { kind: attack, actor: $actor }
    value: { fact: actor.abilityMod.str }   # a number
    modifierType: ability
    policy: sum

  - type: addModifier
    target: { kind: damage, actor: $actor }
    value: { fact: action.weapon.damage.dice }   # dice notation, e.g. `1d8`
    modifierType: weapon
    policy: sum
```

The path must appear in `facts.yaml` exactly as a condition's would, and `content:lint`
reports an unregistered one. A fact reads as a number or as dice notation, and nothing else:
a fact carrying a flat bonus (`1d8+2`) is refused for the same reason authored notation is,
and so is a `rollDice` whose fact reads as a plain number — a number is a total, not a pool.
The reference carries the path and nothing else; arithmetic in a value would put a bonus
somewhere no stacking policy could reach it.

A *derived* path (`actor.ac.effective`) may not be read this way: the `modifiers` phase is
still assembling it, so the read fails exactly as the same read inside a condition would.

### The step's roll result

After the `compare` phase, three paths say how the step's d20 went (ADR-0021):

| Path | Reads |
| --- | --- |
| `step.attack.result` | `hit` / `miss` / `success` / `failure` |
| `step.attack.natural` | the kept die, before modifiers — what a critical hit is about |
| `step.attack.total` | the kept die plus its modifiers |

`attack` names the step's *action*, not the roll's kind: an ability check reads
`step.attack.result` as `success`. They are what a `damage`- or `apply`-phase rule needs —
a critical hit, or a weapon mastery that triggers "if you hit". Read from an earlier phase
they are an error rather than `null`, because the value does not exist yet; on a step whose
action rolls no d20 they are an error too, so a rule that might see one guards on
`action.type` first, as every rule already does.

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
interpretation: null
```

`kind` is `actor` or `item`, and those are the only two (ADR-0024). A fixture carries printed
values only (FR-8): no effective AC, attack bonus or save DC, because rules derive those and
report the terms they came from. `rulesetScope` needs at least one entry — a fixture no
profile can see is content nothing will ever render.

An actor fixture also carries what the stat block prints as `Damage Resistances` and
`Damage Vulnerabilities`, as the rules read them (ADR-0025):

```yaml
slug: awakened-shrub
kind: actor
rulesetScope: [srd-5.1, srd-5.2.1]
data:
  name: Awakened Shrub
  ac: 9
  hp: 10
  proficiencyBonus: 2
  abilities: { str: 3, dex: 8, con: 11, int: 10, wis: 10, cha: 6 }
  resistances: [piercing]
  vulnerabilities: [fire]
citation: { source: srd-5.2.1, section: "Monsters > Awakened Shrub" }
```

Write the types the stat block prints, not the ones a scenario happens to use. A creature
vulnerable to a type no weapon in the packs deals is correct content: the rule lints, and
never fires.

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
and `null`; on an actor, `resistances` and `vulnerabilities` may be left out and read as
`[]`. An actor's other five fields are all required.

Fixtures are **inlined** into a situation when a template renders (ADR-0017): the rendered
situation holds the data, not the slug, so a saved scenario replays identically after a fixture is
corrected. Take a correction up by re-rendering the scenario from its template and params. There is
no per-scenario override mechanism — once the data is inlined, an override is an edited situation.

Like a rule, a fixture may carry an `interpretation`, and it defaults to `null` when left out.
Use it when the citation alone does not account for the numbers. `fighter-3` is the case that
forced the field (ADR-0026): both SRDs publish the Fighter class tables and neither publishes a
third-level fighter, so the hit points are derived and the ability array, the armour and the
weapon are this repository's choices — which has to be said where the numbers are, not in a
commit message.

Where a stat block genuinely differs between editions, write two fixtures and scope each one.
`content:lint` checks that every profile in a template's `suggestedProfiles` resolves each slug
it names to **exactly one** variant: none is an error, and so are two (ADR-0017).

> Check stat values against the SRD before committing; the examples above are illustrative.

## Template

A template is a situation with holes in it, plus the typed params that fill them (FR-18,
FR-19). `renderTemplate` fills the holes, inlines every fixture it names and returns a
`Situation` that is closed over its content (ADR-0017).

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
  rangeFt: { type: number, default: 5, min: 0 }
  useInspiration: { type: boolean, default: false }
  rerollDie: { type: rollChoice, roll: attack, choice: rerollDieIndex, default: 0 }
skeleton:
  actors:
    - { fixture: "{{attacker}}", id: attacker }
    - { fixture: "{{target}}", id: target, conditions: "{{targetConditions}}" }
  timeline:
    - id: r1-attacker
      round: 1
      actorId: attacker
      action:
        type: attack
        mode: melee
        targetId: target
        weapon: "{{weapon}}"
        rangeFt: "{{rangeFt}}"
  intents:
    useInspiration: "{{useInspiration}}"
    rollChoices:
      "{{$rollId(r1-attacker, attack)}}": { rerollDieIndex: "{{rerollDie}}" }
```

### The skeleton

The skeleton is shaped like the `Situation` it produces, minus what rendering supplies
(ADR-0026). You write `actors` and `timeline`; `renderTemplate` adds `schemaVersion`, the
`items` index and each fixture's printed data.

- **An actor** names the fixture slug it inlines, plus the three fields a fixture does not
  carry: `id` (what its steps and rules address it by), `hpCurrent` (defaults to the fixture's
  `hp`) and `conditions` (defaults to empty).
- **The timeline** is explicit, because durations need one: a template about Bless over ten
  rounds cannot be written without several steps in several rounds (ADR-0005). A single-action
  template is a timeline of length 1.
- **Step ids and actor ids are literal**, never params. They are what `$rollId` addresses, and
  a template that parameterised them could not pre-declare its own roll choices.

Everything else is ordinary situation content, validated by `Situation.parse` at the end of
rendering — so a weapon slug with nothing behind it or a step naming an actor that does not
exist is a schema error, and the renderer does not get a second opinion about it (FR-20).

### Placeholders

`{{name}}` is a param. A string that is **exactly** one placeholder is replaced by the param's
*value*, so a `conditionList` yields an array and a `boolean` yields a boolean — YAML has no
way to write a non-string hole. A placeholder inside a longer string interpolates, and only a
scalar may be interpolated.

`{{$rollId(<stepId>, <kind>)}}` expands to `<stepId>/<kind>:<actorId>`, taking the actor from
the step it names. Roll ids are derivable before evaluation precisely so a template can
pre-declare a choice (ADR-0011); `kind` is one of `attack`, `save`, `check`, `initiative`,
`damage`. A placeholder that names neither a param nor `$rollId` is an error, never passed
through.

### Params

Param types: `fixture`, `number`, `boolean`, `enum`, `conditionList`, `rollChoice`. Anything
more complex is edited in the JSON tab. Every param carries a `default`, which is what makes
"renders with its defaults" a check rather than a wish.

A `rollChoice` param declares a per-roll player choice (ADR-0011) — which die a reroll
touches, declared up front because evaluation never pauses (ADR-0003). One param can serve
several rolls: list an entry under `rollChoices` for each one.

`tags` may be left out and reads as empty. An `enum` param's `default` must be one of its
`values`; a `number` param may carry `min` and `max`. All three are checked.

### What `content:lint` checks

Per template, and **per profile it suggests** (ADR-0026, closing Q24):

1. It renders with its defaults into a valid `Situation`.
2. Every fixture slug it names resolves to exactly one variant under that profile — none is an
   error, and so are two (ADR-0017).
3. Every string in `suggestedProfiles` is a profile `profiles.yaml` declares.

It also **warns** when a rule in that profile can request a reroll on a roll the template
declares no `rollChoices` entry for. Defaulting to die 0 is a silent decision rather than a
broken one, but on an advantage pair it decides which of two dice is replaced, and nobody
chose it.
