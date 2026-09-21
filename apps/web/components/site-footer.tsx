import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-6 py-6 text-sm text-muted-foreground">
        <p>
          Code under the MIT licence. Example rules are derived from the SRD 5.1 and SRD 5.2.1 under
          CC BY 4.0.
        </p>
        <p>
          <Link href="/credits" className="underline underline-offset-4 hover:text-foreground">
            Sources and credits
          </Link>
        </p>
      </div>
    </footer>
  );
}
