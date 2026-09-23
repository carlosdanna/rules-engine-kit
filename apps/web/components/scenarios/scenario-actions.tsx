'use client';

/**
 * Per-scenario actions: export always, edit and delete only where they mean something.
 *
 * A seeded row is rebuilt from `scenarios/` by every `db:reset` (ADR-0004), so editing one
 * would be silently undone — it offers Export alone. The writer refuses a seeded row as well
 * (`lib/scenarios/write.ts`); this is the affordance, not the guarantee.
 */

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { deleteScenarioAction, exportScenarioAction } from '@/app/scenarios/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ScenarioExport } from '@/lib/scenarios/export';
import type { ActionResult } from '@/lib/scenarios/types';

export type ScenarioActionsProps = {
  slug: string;
  name: string;
  editable: boolean;
};

/**
 * The download. The YAML is built on the server — `yaml` is a dependency of `packages/db`, not
 * of this app — and the browser only wraps the string it gets back in a Blob.
 */
function downloadYaml({ filename, yaml }: ScenarioExport): void {
  const url = URL.createObjectURL(new Blob([yaml], { type: 'text/yaml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ScenarioActions({ slug, name, editable }: ScenarioActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const [exporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);

  const [deleteResult, runDelete, deleting] = useActionState<
    ActionResult<null> | null,
    { slug: string }
  >(deleteScenarioAction, null);

  function onExport(): void {
    startExport(async () => {
      const result = await exportScenarioAction(null, { slug });
      if (result.ok) {
        downloadYaml(result.data);
        setExportError(null);
      } else {
        setExportError(result.formErrors[0] ?? 'export failed');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export YAML'}
      </Button>

      {editable && (
        <>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/scenarios/${slug}/edit`}>Edit</Link>}
          />
          <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </>
      )}

      {exportError !== null && <span className="text-sm text-destructive">{exportError}</span>}
      {deleteResult !== null && !deleteResult.ok && (
        <span className="text-sm text-destructive">{deleteResult.formErrors[0]}</span>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{name}”?</DialogTitle>
            <DialogDescription>
              This removes the saved row. Export it first if you want to keep it — a `db:reset` will
              not bring a user scenario back (ADR-0004).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Keep it</Button>} />
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                runDelete({ slug });
                setConfirming(false);
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
