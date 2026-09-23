import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ScenarioNotFound() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">No such scenario</h1>
      <p className="text-muted-foreground">
        A scenario is addressed by its slug, which is also its row’s primary key (ADR-0027) — for
        example <code>/scenarios/melee-attack</code>. Nothing saved matches this one.
      </p>
      <Button variant="outline" render={<Link href="/scenarios">Back to scenarios</Link>} />
    </section>
  );
}
