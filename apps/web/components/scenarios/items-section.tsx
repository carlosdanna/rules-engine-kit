'use client';

/**
 * The weapons a situation carries (ADR-0017): inlined copies of item fixtures, keyed by slug.
 * An attack can only name one of these, so a weapon is added here first and picked on the step.
 */

import { formatDiceNotation, type ItemFixture, type Situation } from '@rules-engine-kit/engine';
import { Button } from '@/components/ui/button';
import { addItemFromFixture, removeItem } from '@/lib/scenarios/situation-edits';
import { FixtureAdder } from './fixture-adder';

type Props = {
  situation: Situation;
  fixtures: ItemFixture[];
  onChange: (next: Situation) => void;
};

export function ItemsSection({ situation, fixtures, onChange }: Props) {
  const items = Object.values(situation.items);
  const unused = fixtures.filter((fixture) => situation.items[fixture.slug] === undefined);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Weapons</h3>
        <FixtureAdder
          label="Add weapon from fixture"
          fixtures={unused}
          onAdd={(fixture) => onChange(addItemFromFixture(situation, fixture))}
        />
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None yet. Add one here, then pick it on an attack step; an attack without one is unarmed.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.slug} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="font-medium">{item.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{item.slug}</span>
              <span className="text-muted-foreground">
                {item.damage === null
                  ? 'no damage'
                  : `${formatDiceNotation(item.damage.dice)} ${item.damage.type}`}
                {item.properties.length > 0 && ` · ${item.properties.join(', ')}`}
                {item.mastery !== null && ` · mastery: ${item.mastery}`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => onChange(removeItem(situation, item.slug))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
