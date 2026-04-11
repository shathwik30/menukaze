import { type NextRequest, NextResponse } from 'next/server';
import { parseHost } from '@menukaze/tenant/host';

/**
 * Edge-runtime middleware: parse the request host into a tenant kind and stamp
 * `x-tenant-slug` / `x-tenant-kind` headers so server components downstream
 * can resolve the tenant in the Node runtime (where Mongoose works).
 *
 * This middleware does NOT touch the database — DB lookups happen in the
 * page/layout server component.
 */
export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get('host');
  const parsed = parseHost(host);

  const headers = new Headers(request.headers);
  headers.set('x-tenant-kind', parsed.kind);
  if (parsed.kind === 'subdomain') {
    headers.set('x-tenant-slug', parsed.slug);
  } else if (parsed.kind === 'custom') {
    headers.set('x-tenant-host', parsed.host);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Match every path EXCEPT static assets, _next internals, and favicons.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
