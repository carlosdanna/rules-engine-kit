'use client';

/**
 * The detail panel for one template: the typed params a form would be generated from (FR-19)
 * and the fixtures those params name, resolved per suggested profile.
 */

import type { TemplateRow } from '@rules-engine-kit/db';
import type { ActorFixtureData, ItemFixtureData, TemplateParam } from '@rules-engine-kit/engine';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { FixtureUse } from '@/lib/queries';

export type TemplateDetail = TemplateRow & { fixtures: FixtureUse[] };

export function TemplateSheet({ template }: { template: TemplateDetail | null }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Sheet
      open={template !== null}
      onOpenChange={(open) => {
        if (!open) router.push(pathname, { scroll: false });
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-3xl">
        {template && (
          <>
            <SheetHeader>
              <SheetTitle>{template.name}</SheetTitle>
              <SheetDescription>{template.description}</SheetDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {template.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
                <Badge variant="secondary">schema v{template.schemaVersion}</Badge>
              </div>
            </SheetHeader>

            <div className="space-y-6 overflow-y-auto px-4 pb-6 text-sm">
              <section className="space-y-2">
                <h3 className="font-medium">Params</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Default</TableHead>
                      <TableHead>Constraint</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(template.paramsSchema).map(([name, param]) => (
                      <TableRow key={name}>
                        <TableCell className="font-mono text-xs">{name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{param.type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-normal">
                          {JSON.stringify(param.default)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-normal text-muted-foreground">
                          {constraintOf(param)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="font-medium">Fixtures</h3>
                {template.fixtures.length === 0 ? (
                  <p className="text-muted-foreground">This template names no fixture.</p>
                ) : (
                  template.fixtures.map((use) => (
                    <article key={use.param} className="space-y-2 rounded-lg border p-4">
                      <header className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">{use.param}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono text-xs">{use.slug}</span>
                        <Badge variant="secondary">{use.kind}</Badge>
                      </header>

                      {/*
                        A slug is not an identity: `goblin` is one fixture per edition
                        (ADR-0027). The profile is what picks between them, so each suggested
                        profile gets its own column.
                      */}
                      <div className="grid gap-4 md:grid-cols-2">
                        {use.byProfile.map(({ profile, fixture }) => (
                          <div key={profile} className="space-y-1.5">
                            <Badge variant="outline" className="font-mono">
                              {profile}
                            </Badge>
                            {fixture === null ? (
                              <p className="text-xs text-destructive">
                                No fixture with this slug is in scope for {profile}.
                              </p>
                            ) : (
                              <>
                                <FixtureData data={fixture.data} />
                                <p className="text-xs text-muted-foreground">
                                  {fixture.citation.source} · {fixture.citation.section}
                                </p>
                                {fixture.interpretation && (
                                  <p className="text-xs text-muted-foreground">
                                    {fixture.interpretation}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))
                )}
                <p className="text-xs text-muted-foreground">
                  Fixtures supply printed values only. Attack bonuses, effective AC and save DCs are
                  derived by rules at evaluation time, with their contributing terms (FR-8).
                </p>
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="font-medium">Skeleton</h3>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {JSON.stringify(template.skeleton, null, 2)}
                </pre>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function constraintOf(param: TemplateParam): string {
  switch (param.type) {
    case 'enum':
      return param.values.join(' | ');
    case 'number':
      return [
        param.min === undefined ? null : `min ${param.min}`,
        param.max === undefined ? null : `max ${param.max}`,
      ]
        .filter((part) => part !== null)
        .join(', ');
    case 'fixture':
      return `${param.kind} fixture`;
    case 'rollChoice':
      return `${param.roll} · ${param.choice}`;
    default:
      return '';
  }
}

function FixtureData({ data }: { data: ActorFixtureData | ItemFixtureData }) {
  if ('abilities' in data) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{data.name}</dd>
        <dt className="text-muted-foreground">AC / HP</dt>
        <dd>
          {data.ac} / {data.hp}
        </dd>
        <dt className="text-muted-foreground">Prof.</dt>
        <dd>+{data.proficiencyBonus}</dd>
        <dt className="text-muted-foreground">Abilities</dt>
        <dd className="font-mono">
          {Object.entries(data.abilities)
            .map(([ability, score]) => `${ability} ${score}`)
            .join(' · ')}
        </dd>
        {data.resistances.length > 0 && (
          <>
            <dt className="text-muted-foreground">Resists</dt>
            <dd>{data.resistances.join(', ')}</dd>
          </>
        )}
        {data.vulnerabilities.length > 0 && (
          <>
            <dt className="text-muted-foreground">Vulnerable</dt>
            <dd>{data.vulnerabilities.join(', ')}</dd>
          </>
        )}
      </dl>
    );
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
      <dt className="text-muted-foreground">Name</dt>
      <dd>{data.name}</dd>
      <dt className="text-muted-foreground">Damage</dt>
      <dd className="font-mono">{data.damage ? `${data.damage.dice} ${data.damage.type}` : '—'}</dd>
      {data.properties.length > 0 && (
        <>
          <dt className="text-muted-foreground">Properties</dt>
          <dd>{data.properties.join(', ')}</dd>
        </>
      )}
      {data.mastery && (
        <>
          <dt className="text-muted-foreground">Mastery</dt>
          <dd>{data.mastery}</dd>
        </>
      )}
    </dl>
  );
}
