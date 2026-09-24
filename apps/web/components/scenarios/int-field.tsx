'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';

/** An integer field that never hands back a string, since the schema checks without coercing. */
export function IntField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        type="number"
        step={1}
        min={min}
        value={String(value)}
        aria-label={label}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
}

/** A labelled column for a control that brings its own input, matching `IntField`'s layout. */
export function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </div>
  );
}
