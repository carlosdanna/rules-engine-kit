import { loadStack } from '@rules-engine-kit/db';
import { compareSemver, type RulesetDiff as Diff, diffRulesets } from '@rules-engine-kit/engine';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RuleSheet } from '@/components/rulesets/rule-sheet';
import { RulesExplorer } from '@/components/rulesets/rules-explorer';
import { RulesetDiff } from '@/components/rulesets/ruleset-diff';
import { VersionTabs } from '@/components/rulesets/version-tabs';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { getDb } from '@/lib/db';
import { getVersion, listVersionOptions, type VersionOption } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/rulesets/[slug]/[version]'>) {
  const { slug, version } = await params;
  const found = await getVersion(slug, version);
  return { title: found ? `${found.source.name} ${version}` : 'Ruleset version' };
}

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * The version a diff is taken against when the URL names none: the closest earlier version of
 * the same ruleset, else the closest later one — `5.2.1` against `5.1.0`, and `5.1.0` against
 * `5.2.1`. A ruleset with one version has no default, and the tab asks for a choice.
 */
function siblingOf(current: VersionOption, all: VersionOption[]): string | null {
  const siblings = all
    .filter((option) => option.rulesetId === current.rulesetId && option.id !== current.id)
    .sort((x, y) => compareSemver(x.semver, y.semver));
  const earlier = siblings.filter((option) => compareSemver(option.semver, current.semver) < 0);
  return (earlier.at(-1) ?? siblings[0])?.id ?? null;
}

/** `against` → this version, so "added" reads as what this version brought in (VR-9). */
function diffAgainst(against: string, current: string): Diff | string {
  try {
    const [a, b] = loadStack(getDb(), [against, current]);
    if (a === undefined || b === undefined) return `no ruleset version '${against}'`;
    return diffRulesets(a, b);
  } catch (thrown) {
    return (thrown as Error).message;
  }
}

export default async function RulesetVersionPage({
  params,
  searchParams,
}: PageProps<'/rulesets/[slug]/[version]'>) {
  const { slug, version } = await params;
  const found = await getVersion(slug, version);
  if (!found) notFound();

  const query = await searchParams;
  const wanted = first(query.rule);
  const selected = found.rules.find((rule) => rule.ruleKey === wanted) ?? null;

  const options = await listVersionOptions();
  const current = options.find((option) => option.id === found.version.id);
  const candidates = options.filter((option) => option.id !== found.version.id).map((o) => o.id);
  const wantedAgainst = first(query.against);
  const against =
    wantedAgainst !== undefined && candidates.includes(wantedAgainst)
      ? wantedAgainst
      : current === undefined
        ? null
        : siblingOf(current, options);
  const diff = against === null ? null : diffAgainst(against, found.version.id);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <Link
          href="/rulesets"
          className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2.5' })}
        >
          ← All rulesets
        </Link>

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

      <VersionTabs
        tab={first(query.tab) === 'diff' ? 'diff' : 'rules'}
        against={against}
        candidates={candidates}
        rules={<RulesExplorer rules={found.rules} />}
        diff={
          diff === null ? (
            <p className="text-sm text-muted-foreground">
              This ruleset has no other version. Choose any version above to compare against.
            </p>
          ) : typeof diff === 'string' ? (
            <p className="text-sm text-destructive">{diff}</p>
          ) : (
            <RulesetDiff diff={diff} />
          )
        }
      />

      <RuleSheet
        rule={selected}
        ruleset={found.ruleset}
        version={found.version}
        profiles={found.profiles}
      />
    </div>
  );
}
