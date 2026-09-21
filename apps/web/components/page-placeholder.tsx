/**
 * Stub body for a route whose real UI arrives in a later milestone. Keeps the
 * header nav navigable while M0 is only the shell.
 */
export function PagePlaceholder({ title, summary }: { title: string; summary: string }) {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{summary}</p>
      <p className="text-sm text-muted-foreground">Not built yet — this route is scaffolding.</p>
    </section>
  );
}
