import Link from 'next/link';
import { TemplateSheet } from '@/components/templates/template-sheet';
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
import { fixturesForTemplate, listTemplates } from '@/lib/queries';

export const metadata = { title: 'Templates' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TemplatesPage({ searchParams }: PageProps<'/templates'>) {
  const templates = await listTemplates();

  const { template: wantedParam } = await searchParams;
  const wanted = Array.isArray(wantedParam) ? wantedParam[0] : wantedParam;
  const found = templates.find((template) => template.id === wanted);
  const selected = found ? { ...found, fixtures: await fixturesForTemplate(found) } : null;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="max-w-2xl text-muted-foreground">
          A template is a situation with holes in it. Its params are typed, so a form can be
          generated from them (FR-19), and its fixture params resolve to a different stat block
          under each profile it suggests — which is the edition difference worth looking at.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {templates.map((template) => (
          <Card key={template.id} className="flex flex-col">
            <CardHeader>
              <CardTitle>
                <h2>{template.name}</h2>
              </CardTitle>
              <CardDescription className="font-mono text-xs">{template.id}</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-muted-foreground">{template.description}</p>

              <div className="flex flex-wrap gap-1.5">
                {template.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>Profiles</span>
                {template.suggestedProfiles.map((profile) => (
                  <Badge key={profile} variant="secondary" className="font-mono">
                    {profile}
                  </Badge>
                ))}
              </div>
            </CardContent>

            <CardFooter>
              <Link
                href={`?template=${encodeURIComponent(template.id)}`}
                scroll={false}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Params and fixtures
              </Link>
            </CardFooter>
          </Card>
        ))}
      </section>

      <TemplateSheet template={selected} />
    </div>
  );
}
