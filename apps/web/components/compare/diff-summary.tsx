/**
 * What differs between two runs of one situation (FR-16): the rules that fired on one side
 * only, then every value that differs, then what only one side has at all.
 *
 * Rendered on the server from `diffOutcomes` and `diffTraces`; it holds no state. The profile
 * hashes are shown as the premise of the comparison, not counted as a difference.
 */

import type { OutcomeDiff, RuleRef, TraceDiff } from '@rules-engine-kit/engine';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type DiffSummaryProps = {
  outcomeDiff: OutcomeDiff;
  traceDiff: TraceDiff;
  labels: { a: string; b: string };
};

const json = (value: unknown): string => JSON.stringify(value);

function FiredOnly({ label, rules }: { label: string; rules: RuleRef[] }) {
  return (
    <div className="min-w-0 space-y-1">
      <h3 className="text-sm font-medium">
        Fired only under <span className="font-mono">{label}</span>{' '}
        <span className="text-muted-foreground">({rules.length})</span>
      </h3>
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">none</p>
      ) : (
        <ul className="space-y-0.5 text-xs" data-testid="fired-only">
          {rules.map((rule) => (
            <li key={rule.key} className="font-mono">
              <span className="text-muted-foreground">
                {rule.stepId} · {rule.phase} ·
              </span>{' '}
              {rule.ruleKey}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DiffSummary({ outcomeDiff, traceDiff, labels }: DiffSummaryProps) {
  const changedEvents = traceDiff.events.filter((event) => event.status !== 'same').length;
  const oneSided = [
    ...outcomeDiff.onlyA.map((path) => ({ path, side: labels.a })),
    ...outcomeDiff.onlyB.map((path) => ({ path, side: labels.b })),
  ];

  return (
    <Card data-testid="diff-summary">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Differences
          {outcomeDiff.identical && traceDiff.identical ? (
            <Badge variant="secondary">none</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/70">
              {outcomeDiff.values.length} value{outcomeDiff.values.length === 1 ? '' : 's'} ·{' '}
              {changedEvents} trace event{changedEvents === 1 ? '' : 's'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FiredOnly label={labels.a} rules={traceDiff.firedOnlyIn.a} />
          <FiredOnly label={labels.b} rules={traceDiff.firedOnlyIn.b} />
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-medium">Values that differ</h3>
          {outcomeDiff.values.length === 0 ? (
            <p className="text-sm text-muted-foreground">none</p>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="differing-values">
                <TableHeader>
                  <TableRow>
                    <TableHead>Path</TableHead>
                    <TableHead className="font-mono">{labels.a}</TableHead>
                    <TableHead className="font-mono">{labels.b}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outcomeDiff.values.map((value) => (
                    <TableRow key={value.path}>
                      <TableCell className="font-mono text-xs">{value.path}</TableCell>
                      <TableCell className="max-w-64 truncate font-mono text-xs">
                        {json(value.a)}
                      </TableCell>
                      <TableCell className="max-w-64 truncate font-mono text-xs">
                        {json(value.b)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {oneSided.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Present on one side only</h3>
            <ul className="space-y-0.5 text-xs">
              {oneSided.map(({ path, side }) => (
                <li key={`${side}/${path}`} className="font-mono">
                  {path} <span className="text-muted-foreground">— {side} only</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="grid gap-1 text-xs sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">{labels.a} hash</dt>
          <dd className="truncate font-mono">{outcomeDiff.identity.profileHash.a}</dd>
          <dt className="text-muted-foreground">{labels.b} hash</dt>
          <dd className="truncate font-mono">{outcomeDiff.identity.profileHash.b}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
