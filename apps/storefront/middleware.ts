import { type NextRequest, NextResponse } from 'next/server';
import { parseHost } from '@menukaze/tenant/host';

/**
 * Edge-runtime middleware: parse the request host into a tenant kind and stamp
 * `x-tenant-slug` / `x-tenant-kind` headers so server components downstream
 * can resolve the tenant in the Node runtime (where Mongoose works).
 *
 * Also applies nonce-based CSP and security headers on every response.
 */
function buildCsp(nonce: string): string {
  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': `'self' 'nonce-${nonce}' 'strict-dynamic'`,
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: blob: https://utfs.io",
    'font-src': "'self' data:",
    'connect-src':
      "'self' https://realtime.ably.io wss://realtime.ably.io https://rest.ably.io https://api.razorpay.com",
    'frame-src': 'https://api.razorpay.com',
    'object-src': "'none'",
    'base-uri': "'self'",
    'frame-ancestors': "'none'",
    'upgrade-insecure-requests': '',
  };
  return Object.entries(directives)
    .map(([k, v]) => (v ? `${k} ${v}` : k))
    .join('; ');
}

export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get('host');
  const parsed = parseHost(host);

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-tenant-kind', parsed.kind);
  if (parsed.kind === 'subdomain') {
    reqHeaders.set('x-tenant-slug', parsed.slug);
  } else if (parsed.kind === 'custom') {
    reqHeaders.set('x-tenant-host', parsed.host);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  reqHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: reqHeaders } });

  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  // Match every path EXCEPT static assets, _next internals, and favicons.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
