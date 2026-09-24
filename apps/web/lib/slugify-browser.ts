/**
 * `slugify`'s rules (`packages/db/src/slug.ts`), duplicated for the browser: `packages/db`
 * opens SQLite and cannot be imported into a client component. Used only to suggest a slug as a
 * name is typed; the server validates and dedupes what is submitted (ADR-0029, ADR-0031).
 */
export function slugifyInBrowser(name: string, fallback = 'scenario'): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug === '' ? fallback : slug;
}
