'use client';

import { cn } from 'cn';
import type * as React from 'react';

/**
 * `htmlFor` and `children` are named rather than left to the spread so the association and the
 * text are visible at this element — which is what `lint/a11y/noLabelWithoutControl` checks,
 * and it cannot see through `{...props}`. Behaviour is the registry's: both still come from the
 * caller, and `field.tsx` is what usually supplies them.
 */
function Label({ className, htmlFor, children, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      htmlFor={htmlFor}
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

export { Label };
