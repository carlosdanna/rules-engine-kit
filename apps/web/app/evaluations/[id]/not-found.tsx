import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function EvaluationNotFound() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">No such evaluation</h1>
      <p className="text-muted-foreground">
        A stored run is addressed by the uuid it was given when it ran (ADR-0027). None matches this
        one — <code>pnpm db:reset --hard</code> deletes every stored run.
      </p>
      <Button variant="outline" render={<Link href="/playground">Go to the playground</Link>} />
    </section>
  );
}
