import { Fragment } from 'react';
import { DeleteProfileButton } from '@/components/profiles/delete-profile-button';
import { ProfileBuilder } from '@/components/profiles/profile-builder';
import { ResolutionReport } from '@/components/profiles/resolution-report';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { previewProfile } from '@/lib/profiles/write';
import { listProfileStacks, listVersionOptions } from '@/lib/queries';

export const metadata = { title: 'Profiles' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Order ruleset versions into a profile, and see what each profile resolves to (FR-2, FR-12,
 * VR-3, ADR-0031).
 *
 * Every saved profile is resolved again here, from its rows, so its conflicts are the ones the
 * current content produces and a hash that has drifted from the stored one is labelled.
 */
export default async function ProfilesPage() {
  const [versions, stacks] = await Promise.all([listVersionOptions(), listProfileStacks()]);
  const db = getDb();

  return (
    <div className="space-y-8">
      <section className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>
        <p className="text-muted-foreground">
          A profile is an ordered stack of ruleset versions, base first. Layers apply in order and
          the last operation on a rule key wins; the resolved rules and the layer identities make
          the hash a run records.
        </p>
      </section>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ruleset versions yet. Run <code className="font-mono">pnpm db:reset</code>.
        </p>
      ) : (
        <ProfileBuilder versions={versions} />
      )}

      <section className="space-y-3" aria-label="Saved profiles">
        <h2 className="text-lg font-semibold">Saved profiles</h2>
        {stacks.map((stack) => {
          const resolved = previewProfile(db, stack.versionIds);
          return (
            <Card key={stack.id} data-testid="profile-card">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{stack.id}</span>
                  <span className="text-sm font-normal text-muted-foreground">{stack.name}</span>
                  <Badge variant={stack.origin === 'user' ? 'default' : 'secondary'}>
                    {stack.origin}
                  </Badge>
                  {stack.origin === 'user' && (
                    <span className="ml-auto">
                      <DeleteProfileButton id={stack.id} />
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  {stack.versionIds.map((id, position) => (
                    <Fragment key={id}>
                      {position > 0 && <span className="text-muted-foreground"> → </span>}
                      <span className="font-mono text-xs">{id}</span>
                    </Fragment>
                  ))}
                </p>
                {resolved.ok ? (
                  <ResolutionReport preview={resolved.data} storedHash={stack.resolvedHash} />
                ) : (
                  <p className="text-sm text-destructive">{resolved.formErrors.join(' ')}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
