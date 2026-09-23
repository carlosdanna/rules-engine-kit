import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RuleSheet } from '@/components/rulesets/rule-sheet';
import { RulesExplorer } from '@/components/rulesets/rules-explorer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getVersion } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/rulesets/[slug]/[version]'>) {
  const { slug, version } = await params;
  const found = await getVersion(slug, version);
  return { title: found ? `${found.source.name} ${version}` : 'Ruleset version' };
}

export default async function RulesetVersionPage({
  params,
  searchParams,
}: PageProps<'/rulesets/[slug]/[version]'>) {
  const { slug, version } = await params;
  const found = await getVersion(slug, version);
  if (!found) notFound();

  const { rule: selectedKey } = await searchParams;
  const wanted = Array.isArray(selectedKey) ? selectedKey[0] : selectedKey;
  const selected = found.rules.find((rule) => rule.ruleKey === wanted) ?? null;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2.5"
          render={<Link href="/rulesets">← All rulesets</Link>}
        />

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{found.source.name}</h1>
          <Badge variant={found.ruleset.kind === 'layer' ? 'default' : 'secondary'}>
            {found.ruleset.kind}
          </Badge>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:max-w-xl">
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-mono text-xs">{found.version.id}</dd>

          {found.version.baseRulesetId && (
            <>
              <dt className="text-muted-foreground">Extends</dt>
              <dd className="font-mono text-xs">
                {found.version.baseRulesetId} {found.version.baseRange}
              </dd>
            </>
          )}

          <dt className="text-muted-foreground">Content hash</dt>
          <dd className="font-mono text-xs break-all">{found.version.contentHash}</dd>

          <dt className="text-muted-foreground">Licence</dt>
          <dd>
            {found.source.license} · {found.source.author}
          </dd>

          <dt className="text-muted-foreground">In profiles</dt>
          <dd className="flex flex-wrap gap-1">
            {found.profiles.length === 0 ? (
              <span className="text-muted-foreground">none</span>
            ) : (
              found.profiles.map((profile) => (
                <Badge key={profile.id} variant="outline" className="font-mono">
                  {profile.id}
                </Badge>
              ))
            )}
          </dd>
        </dl>
      </section>

      <RulesExplorer rules={found.rules} />

      <RuleSheet
        rule={selected}
        ruleset={found.ruleset}
        version={found.version}
        profiles={found.profiles}
      />
    </div>
  );
}
