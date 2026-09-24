'use client';

/** Delete a user profile; the server refuses a seeded one and one with stored runs (ADR-0031). */

import { useState, useTransition } from 'react';
import { deleteProfileAction } from '@/app/profiles/actions';
import { Button } from '@/components/ui/button';

export function DeleteProfileButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error !== null && <span className="text-xs text-destructive">{error}</span>}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete profile '${id}'?`)) return;
          startTransition(async () => {
            const result = await deleteProfileAction(id);
            setError(result.ok ? null : result.formErrors.join(' '));
          });
        }}
      >
        {pending ? 'Deleting…' : 'Delete'}
      </Button>
    </div>
  );
}
