# ADR-0006: Fixtures hold printed inputs; situational values are derived by rules

- Status: accepted
- Date: 2026-09-21

## Context
Q2. AC, attack bonus and save DC can each be (a) printed in a stat block, (b) arithmetic over ability scores and proficiency, or (c) changed at evaluation time by cover, Bless, prone or a layer. If fixtures store final numbers, the modifier-stacking feature has nothing to stack onto. If rules compute everything, we are writing character-building rules, which ADR-0003 puts out of scope.

## Options

1. **Fixtures store final values.** `ac: 15`, `attackBonus: 5`, `saveDc: 13`.
   - Pros: no derivation code; fixtures read exactly like the SRD stat block.
   - Cons: the interesting part (stacking, cover, Bless, version differences) has no surface to attach to; every modifier becomes an ad-hoc patch on a number.

2. **Rules compute everything from raw scores.** Fixtures hold ability scores, class, level and equipment; a `derive` phase builds AC from armour rules, attack bonus from proficiency and class features, save DCs from spellcasting ability.
   - Pros: maximally "engine"; version differences in derivation would be visible.
   - Cons: requires encoding armour, class and character-building rules — outside the core subset — and a lot of SRD hand-encoding for little demo payoff.

3. **Hybrid: printed inputs + derived situational values (recommended).** Fixtures carry what the SRD prints for that creature (ability scores, proficiency bonus, base AC, HP). Ability modifiers are pure arithmetic supplied by the fact registry. Anything a rule or layer could plausibly change — effective AC, an attack roll's bonus, a save DC, damage — is assembled during the `modifiers` phase from registered facts, so every contributing term appears in the trace.

```ts
type ActorFixture = {
  slug: string;
  name: string;
  abilities: Record<Ability, number>;   // raw scores, as printed
  proficiencyBonus: number;
  ac: number;                           // printed/base AC
  hp: number;
  // deliberately absent: attackBonus, saveDc, initiativeBonus — all derived
  citation: Citation;
};

// Registered in facts.yaml; pure arithmetic, no rule needed:
//   actor.abilityMod.<ability>  = floor((score - 10) / 2)
//   actor.ac.base               = fixture.ac
// Built by modifier effects during the `modifiers` phase, one term per contributor:
//   actor.ac.effective, roll.attack.bonus, roll.save.dc, damage.total

type DerivedValue = {
  path: string;                         // e.g. 'roll.attack.bonus'
  base: number;
  terms: { source: string; ruleKey: string; value: number; modifierType: string }[];
  total: number;
};
```

## Decision
Option 3. Fixtures are inputs only: raw ability scores, proficiency bonus, printed AC and HP. Ability modifiers come from the fact registry as arithmetic. Every situational value is derived by modifier effects and exposed as a `DerivedValue` with its terms, so the trace explains each number.

## Consequences
- The fixture schema in `content-authoring.md` loses `attackBonus`/`saveDc`-style fields; the goblin example keeps `ac` and `abilities`.
- `facts.yaml` must register both the raw paths and the derived paths; unknown paths stay errors.
- `Outcome.derived` carries `DerivedValue` records, which the trace viewer renders as "10 base + 3 Dex + 2 cover = 15".
- Golden tests hand-derive totals from SRD text, term by term, per CLAUDE.md.
