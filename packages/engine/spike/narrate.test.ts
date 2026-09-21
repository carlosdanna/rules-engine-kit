/** SPIKE — prints a narrative rendering of one trace, to see what the events can carry. */
import { it } from 'vitest';
import { srd51, srd521 } from './content';
import { evaluate, resolveProfile } from './engine';
import type { Situation, TraceEvent } from './model';

const situation: Situation = {
  actors: [
    {
      id: 'fighter',
      abilities: { str: 16, dex: 12 },
      proficiencyBonus: 2,
      ac: 16,
      conditions: ['inspired'],
    },
    { id: 'dummy', abilities: { str: 10, dex: 10 }, proficiencyBonus: 2, ac: 15, conditions: [] },
  ],
  timeline: [
    {
      id: 's1',
      round: 1,
      actorId: 'fighter',
      action: { type: 'attack', mode: 'melee', targetId: 'dummy', rangeFt: 5 },
    },
  ],
  intents: { useInspiration: true },
};
const forcedRolls = { 's1/attack:fighter': [15, 4], 's1/attack:fighter:reroll': [4] };

function narrate(e: TraceEvent): string | null {
  switch (e.kind) {
    case 'rule':
      return e.status === 'fired'
        ? `  [${e.phase}] ${e.ruleKey} fired (${e.citation.source} · ${e.citation.section})`
        : null;
    case 'roll': {
      const mode =
        e.modeInputs.map((m) => `${m.mode} from ${m.ruleKey}`).join(' + ') || 'no mode inputs';
      const tf = e.transforms
        .map((t) => `${t.kind} die[${t.dieIndex}] ${t.from}→${t.to} (${t.ruleKey})`)
        .join('; ');
      const mods = e.modifiers
        .map((m) => `${m.value >= 0 ? '+' : ''}${m.value} ${m.modifierType}`)
        .join(' ');
      return [
        `  [roll] ${e.target}: ${mode} ⇒ ${e.mode}`,
        `         dice ${JSON.stringify(e.dice)}${tf ? ` → ${tf} → ${JSON.stringify(e.diceAfterTransforms)}` : ''}`,
        `         kept ${e.kept} ${mods} = ${e.total}`,
      ].join('\n');
    }
    case 'compare':
      return `  [compare] ${e.total} vs DC ${e.dc} → ${e.result}`;
    default:
      return null;
  }
}

it('narrative rendering of the same attack under both editions', () => {
  for (const [name, layers] of [
    ['SRD 5.1', [srd51]],
    ['SRD 5.2.1', [srd521]],
  ] as const) {
    console.log(`\n=== ${name} ===`);
    const { trace } = evaluate(situation, resolveProfile([...layers]), {
      seed: 'spike',
      forcedRolls,
    });
    for (const e of trace.events) {
      const line = narrate(e);
      if (line) console.log(line);
    }
  }
});
