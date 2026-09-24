import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { listVersions } from '@/lib/queries';

export const metadata = { title: 'Rulesets' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RulesetsPage() {
  const versions = await listVersions();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Rulesets</h1>
        <p className="max-w-2xl text-muted-foreground">
          A ruleset is a slug across versions, and a version is identified by its semver alone
          (ADR-0016). A base stands on its own; a layer declares the range of bases it extends.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {versions.map(({ version, ruleset, source, ruleCount, profiles }) => (
          <Card key={version.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {/* `source.name` is the edition's own name; `rulesets.name` is not per-edition. */}
                <h2>{source.name}</h2>
                <Badge variant={ruleset.kind === 'layer' ? 'default' : 'secondary'}>
                  {ruleset.kind}
                </Badge>
              </CardTitle>
              <CardDescription className="font-mono text-xs">{version.id}</CardDescription>
            </CardHeader>

            <CardContent className="flex-1">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Rules</dt>
                <dd>{ruleCount}</dd>

                {version.baseRulesetId && (
                  <>
                    <dt className="text-muted-foreground">Extends</dt>
                    <dd className="font-mono text-xs">
                      {version.baseRulesetId} {version.baseRange}
                    </dd>
                  </>
                )}

                <dt className="text-muted-foreground">Content hash</dt>
                <dd className="font-mono text-xs break-all">{shortHash(version.contentHash)}</dd>

                <dt className="text-muted-foreground">Licence</dt>
                <dd>{source.license}</dd>

                <dt className="text-muted-foreground">In profiles</dt>
                <dd>
                  {profiles.length === 0 ? (
                    <span className="text-muted-foreground">none</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {profiles.map((profile) => (
                        <Badge key={profile.id} variant="outline" className="font-mono">
                          {profile.id}
                        </Badge>
                      ))}
                    </span>
                  )}
                </dd>
              </dl>
            </CardContent>

            <CardFooter>
              <Link
                href={`/rulesets/${ruleset.id}/${version.semver}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Browse {ruleCount} {ruleCount === 1 ? 'rule' : 'rules'}
              </Link>
            </CardFooter>
          </Card>
        ))}
      </section>
    </div>
  );
}

/** `sha256:` plus the first twelve hex digits — enough to compare two by eye. */
function shortHash(hash: string): string {
  const [algorithm, digest] = hash.split(':');
  return digest ? `${algorithm}:${digest.slice(0, 12)}…` : hash;
}
