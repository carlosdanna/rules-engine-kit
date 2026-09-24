/**
 * What `resolveProfile` said about a stack (FR-12, VR-3): its hash, or why it cannot resolve,
 * and every conflict it reported along the way.
 *
 * Shared by the builder's live preview and the list of saved profiles. For a saved one,
 * `storedHash` is `profiles.resolved_hash`, and a live hash that differs is labelled: runs
 * under that profile are refused until a reseed takes the hash again (ADR-0030, ADR-0031).
 */

import type { IncompatibleStackReason } from '@rules-engine-kit/engine';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ProfilePreview } from '@/lib/profiles/write';

/** What to do about each way a stack can fail, in the builder's own terms. */
const REMEDY: Record<IncompatibleStackReason['kind'], string> = {
  'empty-stack': 'Add a base ruleset version.',
  'base-not-first': 'Drag a base version to the top of the stack.',
  'layer-expected': 'Only the top of the stack may be a base; remove the second base.',
  'duplicate-ruleset': 'Remove the repeated version.',
  'base-mismatch': 'Choose a layer written for this base, or change the base.',
  'unsupported-range': 'The layer declares a range this engine cannot read; fix its pack.yaml.',
  'range-unsatisfied': 'Choose a base version the layer supports.',
};

export function ResolutionReport({
  preview,
  storedHash,
}: {
  preview: ProfilePreview;
  storedHash?: string;
}) {
  if (preview.status === 'incompatible') {
    return (
      <div
        className="space-y-1 rounded-lg border border-destructive/40 px-3 py-2 text-sm"
        role="alert"
        data-testid="incompatible"
      >
        <p className="font-medium text-destructive">Incompatible stack</p>
        <p>{preview.message}</p>
        <p className="text-muted-foreground">{REMEDY[preview.reason.kind]}</p>
      </div>
    );
  }

  const stale = storedHash !== undefined && storedHash !== preview.hash;
  return (
    <div className="space-y-3">
      <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Resolved hash</dt>
        <dd className="font-mono break-all" data-testid="resolved-hash">
          {preview.hash}
        </dd>
        {stale && (
          <>
            <dt className="text-muted-foreground">Stored hash</dt>
            <dd className="font-mono break-all">
              {storedHash}{' '}
              <Badge variant="destructive">stale — runs are refused until a reseed</Badge>
            </dd>
          </>
        )}
      </dl>

      {preview.conflicts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No conflicts.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table data-testid="conflicts">
            <TableHeader>
              <TableRow>
                <TableHead>Conflict</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Layer</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.conflicts.map((conflict) => (
                <TableRow key={`${conflict.kind}/${conflict.layer}/${conflict.ruleKey}`}>
                  <TableCell>
                    <Badge variant="outline">{conflict.kind}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{conflict.ruleKey}</TableCell>
                  <TableCell className="font-mono text-xs">{conflict.layer}</TableCell>
                  <TableCell className="text-xs whitespace-normal">{conflict.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
