import { headers } from 'next/headers';

/**
 * Phase 3 placeholder home. Reads the tenant slug injected by middleware.ts
 * and renders it. Phase 4 will replace this with the real menu rendering.
 */
export default async function HomePage() {
  const h = await headers();
  const slug = h.get('x-tenant-slug');
  const kind = h.get('x-tenant-kind');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">Menukaze Storefront</h1>
      {slug ? (
        <p className="text-muted-foreground text-xl">
          Tenant: <span className="text-foreground font-mono font-semibold">{slug}</span>
        </p>
      ) : (
        <p className="text-muted-foreground text-xl">
          No tenant resolved (host kind: <span className="font-mono">{kind ?? 'unknown'}</span>)
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        Visit <code>http://demo.localhost.menukaze.dev:3001</code> to test subdomain routing.
      </p>
    </main>
  );
}
