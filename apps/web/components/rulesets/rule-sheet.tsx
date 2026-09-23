'use client';

/**
 * The detail panel for one rule. Open state lives in the URL as `?rule=<ruleKey>`, so a rule
 * is linkable and the back button closes the panel.
 */

import type { RuleRow, RulesetRow, RulesetVersionRow } from '@rules-engine-kit/db';
import { usePathname, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ProfileUse } from '@/lib/queries';

export function RuleSheet({
  rule,
  ruleset,
  version,
  profiles,
}: {
  rule: RuleRow | null;
  ruleset: RulesetRow;
  version: RulesetVersionRow;
  profiles: ProfileUse[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Sheet
      open={rule !== null}
      onOpenChange={(open) => {
        if (!open) router.push(pathname, { scroll: false });
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl">
        {rule && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono text-sm">{rule.ruleKey}</SheetTitle>
              <SheetDescription>{rule.label ?? 'No label on this entry.'}</SheetDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="secondary">{rule.op}</Badge>
                {rule.phase && <Badge variant="secondary">{rule.phase}</Badge>}
                {rule.priority !== null && (
                  <Badge variant="outline">priority {rule.priority}</Badge>
                )}
                {(rule.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </SheetHeader>

            <div className="space-y-5 overflow-y-auto px-4 pb-6">
              {rule.description && (
                <Section title="Description">
                  <p className="text-muted-foreground">{rule.description}</p>
                </Section>
              )}

              <Section title="Condition">
                {rule.condition === null ? (
                  <p className="text-muted-foreground">
                    None — the rule always applies once selected for its phase.
                  </p>
                ) : (
                  <Code value={rule.condition} />
                )}
              </Section>

              <Section title="Effects">
                {(rule.effects ?? []).length === 0 ? (
                  <p className="text-muted-foreground">None.</p>
                ) : (
                  <ul className="space-y-2">
                    {keyed(rule.effects ?? []).map(([key, effect]) => (
                      <li key={key} className="space-y-1.5">
                        <Badge variant="secondary">{effect.type}</Badge>
                        <Code value={effect} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {rule.patch && (
                <Section title="Patch">
                  <Code value={rule.patch} />
                </Section>
              )}

              {rule.reason && (
                <Section title="Reason">
                  <p className="text-muted-foreground">{rule.reason}</p>
                </Section>
              )}

              <Section title="Citation">
                {rule.citation ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">Source</dt>
                    {/*
                      Printed, never linked: `citation.source` is a profile slug on the SRD
                      rules and a pack id on the house rule, so there is no one thing to
                      resolve it against.
                    */}
                    <dd className="font-mono text-xs">{rule.citation.source}</dd>
                    <dt className="text-muted-foreground">Section</dt>
                    <dd>{rule.citation.section}</dd>
                  </dl>
                ) : (
                  <p className="text-muted-foreground">None on this entry.</p>
                )}
              </Section>

              {rule.interpretation && (
                <Section title="Interpretation">
                  <p className="text-muted-foreground">{rule.interpretation}</p>
                </Section>
              )}

              <Separator />

              <Section title="Layer">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Ruleset</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono text-xs">{ruleset.id}</span>
                    <Badge variant={ruleset.kind === 'layer' ? 'default' : 'secondary'}>
                      {ruleset.kind}
                    </Badge>
                  </dd>

                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="font-mono text-xs">{version.semver}</dd>

                  {version.baseRulesetId && (
                    <>
                      <dt className="text-muted-foreground">Extends</dt>
                      <dd className="font-mono text-xs">
                        {version.baseRulesetId} {version.baseRange}
                      </dd>
                    </>
                  )}

                  <dt className="text-muted-foreground">Op</dt>
                  <dd className="font-mono text-xs">{rule.op}</dd>

                  <dt className="text-muted-foreground">In profiles</dt>
                  <dd className="flex flex-wrap gap-1">
                    {profiles.length === 0 ? (
                      <span className="text-muted-foreground">none</span>
                    ) : (
                      profiles.map((profile) => (
                        <Badge key={profile.id} variant="outline" className="font-mono">
                          {profile.id}
                          <span className="ml-1 text-muted-foreground">#{profile.position}</span>
                        </Badge>
                      ))
                    )}
                  </dd>
                </dl>
                <p className="pt-2 text-xs text-muted-foreground">
                  This version authors the rule. Which layer supplies the body that survives a merge
                  depends on the profile, and is shown where a profile is resolved.
                </p>
              </Section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Effects are an ordered list with no identity of their own, so the key is the effect itself
 * plus its ordinal among identical siblings — stable across renders without leaning on the
 * array index.
 */
function keyed<T>(items: readonly T[]): [string, T][] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const shape = JSON.stringify(item);
    const ordinal = seen.get(shape) ?? 0;
    seen.set(shape, ordinal + 1);
    return [`${shape}#${ordinal}`, item];
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 text-sm">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Code({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
