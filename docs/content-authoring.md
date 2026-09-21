# Content authoring

All seeded content lives in `content/` as YAML and is validated by `pnpm content:lint`. The database is rebuilt from it; never edit seeded rows directly.

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
phase: initiative
priority: 100
description: Surprised creatures roll initiative with disadvantage.
condition: { "==": [{ "var": "actor.surprised" }, true] }
effects:
  - type: rollMode
    target: initiative
    mode: disadvantage
citation:
  source: srd-5.2.1
  section: "Rules Glossary > Surprise"
interpretation: null     # explain any reading of ambiguous wording
```

Conventions:

- `rule_key` is `domain.concept[.detail]`, lowercase, stable across versions. Renames keep the key and change `label`.
- One concept per rule; prefer several small rules over one with many effects.
- Citations point to SRD section paths, not page numbers.
- Only SRD 5.1 / 5.2.1 content. Paraphrase; don't paste long passages.

## Fixture

```yaml
slug: goblin
kind: actor
rulesetScope: [srd-5.1, srd-5.2.1]   # split into two fixtures if stat blocks differ
data:
  name: Goblin
  ac: 15
  hp: 7
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }
citation: { source: srd-5.2.1, section: "Monsters > Goblin" }
```

> Check stat values against the SRD before committing; the example above is illustrative.

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
skeleton:
  action: { type: attack, mode: melee, weapon: "{{weapon}}" }
  actors: ["{{attacker}}", { ref: "{{target}}", conditions: "{{targetConditions}}" }]
  intents: { useInspiration: "{{useInspiration}}" }
```

Param types: `fixture`, `number`, `boolean`, `enum`, `conditionList`. Anything more complex is edited in the JSON tab.

Every template must render with its defaults into a valid situation; `content:lint` checks this.
