'use client';

import type { Fixture } from '@rules-engine-kit/engine';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * A select that acts as a button: picking a fixture adds it and the select resets, so the same
 * stat block can be added twice. The list is already filtered to the editor's fixture profile.
 */
export function FixtureAdder<F extends Fixture>({
  label,
  fixtures,
  onAdd,
}: {
  label: string;
  fixtures: F[];
  onAdd: (fixture: F) => void;
}) {
  return (
    <Select
      value={null}
      onValueChange={(slug) => {
        const fixture = fixtures.find((candidate) => candidate.slug === slug);
        if (fixture !== undefined) onAdd(fixture);
      }}
    >
      <SelectTrigger size="sm" aria-label={label} disabled={fixtures.length === 0}>
        <SelectValue placeholder={fixtures.length === 0 ? 'nothing under this profile' : label} />
      </SelectTrigger>
      <SelectContent>
        {fixtures.map((fixture) => (
          <SelectItem key={fixture.slug} value={fixture.slug}>
            <span>{fixture.data.name}</span>
            <span className="font-mono text-xs text-muted-foreground"> {fixture.slug}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
