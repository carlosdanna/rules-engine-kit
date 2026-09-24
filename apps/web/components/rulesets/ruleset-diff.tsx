/**
 * What one ruleset version authors differently from another (VR-9), entry by entry on
 * `rule_key`. The authored diff, not the resolved one: what a stack of them produces is on
 * `/profiles`, and what it does to a run is on `/compare`.
 */

import type { RulesetDiff as Diff, RuleEntry } from '@rules-engine-kit/engine';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * Fields that describe a rule without changing what it decides. Every rule cites its own
 * edition, so between two SRD versions *every* rule's citation differs; a change confined to
 * these is listed apart, so the ones that change a run are not buried under them.
 */
const DESCRIPTIVE = new Set(['label', 'description', 'tags', 'citation', 'interpretation']);

type Change = Diff['changed'][number];

function ChangeCard({ change, a, b }: { change: Change; a: string; b: string }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{change.key}</span>
        {change.fields.map((field) => (
          <Badge key={field.field} variant={DESCRIPTIVE.has(field.field) ? 'outline' : 'secondary'}>
            {field.field}
          </Badge>
        ))}
      </div>
      {change.fields.map((field) => (
        <div key={field.field} className="space-y-1">
          <div className="text-xs text-muted-foreground">{field.field}</div>
          <div className="grid gap-2 md:grid-cols-2">
            <pre className="overflow-x-auto rounded-md bg-red-500/10 p-2 font-mono text-xs whitespace-pre-wrap">
              <span className="text-muted-foreground">{a}</span>
              {'\n'}
              {pretty(field.a)}
            </pre>
            <pre className="overflow-x-auto rounded-md bg-green-500/10 p-2 font-mono text-xs whitespace-pre-wrap">
              <span className="text-muted-foreground">{b}</span>
              {'\n'}
              {pretty(field.b)}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}

function ruleHref(side: { id: string; version: string }, key: string): string {
  return `/rulesets/${encodeURIComponent(side.id)}/${encodeURIComponent(side.version)}?rule=${encodeURIComponent(key)}`;
}

function EntryList({
  title,
  entries,
  side,
  testId,
}: {
  title: string;
  entries: RuleEntry[];
  side: { id: string; version: string };
  testId: string;
}) {
  return (
    <section className="space-y-1" data-testid={testId}>
      <h3 className="text-sm font-medium">
        {title} <span className="text-muted-foreground">({entries.length})</span>
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">none</p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {entries.map((entry) => (
            <li key={entry.key} className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{entry.op}</Badge>
              <Link
                href={ruleHref(side, entry.key)}
                className="font-mono text-xs underline-offset-3 hover:underline"
              >
                {entry.key}
              </Link>
              {'label' in entry && entry.label !== undefined && (
                <span className="text-xs text-muted-foreground">{entry.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RulesetDiff({ diff }: { diff: Diff }) {
  const a = `${diff.a.id}@${diff.a.version}`;
  const b = `${diff.b.id}@${diff.b.version}`;
  const behavioural = diff.changed.filter((c) => c.fields.some((f) => !DESCRIPTIVE.has(f.field)));
  const descriptive = diff.changed.filter((c) => c.fields.every((f) => DESCRIPTIVE.has(f.field)));

  return (
    <div className="space-y-6" data-testid="ruleset-diff">
      <p className="text-sm text-muted-foreground">
        From <span className="font-mono">{a}</span> to <span className="font-mono">{b}</span>:{' '}
        {diff.added.length} added, {diff.removed.length} removed, {behavioural.length} changed in
        behaviour, {descriptive.length} in wording or citation only, {diff.unchanged} unchanged.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <EntryList title={`Only in ${b}`} entries={diff.added} side={diff.b} testId="diff-added" />
        <EntryList
          title={`Only in ${a}`}
          entries={diff.removed}
          side={diff.a}
          testId="diff-removed"
        />
      </div>

      <section className="space-y-3" data-testid="diff-changed">
        <h3 className="text-sm font-medium">
          Changed behaviour <span className="text-muted-foreground">({behavioural.length})</span>
        </h3>
        {behavioural.length === 0 && <p className="text-sm text-muted-foreground">none</p>}
        {behavioural.map((change) => (
          <ChangeCard key={change.key} change={change} a={a} b={b} />
        ))}
      </section>

      {descriptive.length > 0 && (
        <details className="space-y-3" data-testid="diff-descriptive">
          <summary className="cursor-pointer text-sm font-medium">
            Wording or citation only{' '}
            <span className="text-muted-foreground">({descriptive.length})</span>
          </summary>
          <div className="space-y-3 pt-3">
            {descriptive.map((change) => (
              <ChangeCard key={change.key} change={change} a={a} b={b} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
