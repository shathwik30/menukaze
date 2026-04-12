import { type NextRequest, NextResponse } from 'next/server';
import { parseHost } from '@menukaze/tenant/host';

/**
 * Build a nonce-based Content-Security-Policy header value.
 *
 * Uses 'strict-dynamic' so Next.js-injected scripts and lazily loaded
 * third-party scripts (Ably, Razorpay) inherit trust from the nonce-validated
 * runtime without needing individual allowlist entries.
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
  const parsed = parseHost(request.headers.get('host'));
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-tenant-kind', parsed.kind);
  if (parsed.kind === 'subdomain') reqHeaders.set('x-tenant-slug', parsed.slug);
  if (parsed.kind === 'custom') reqHeaders.set('x-tenant-host', parsed.host);

  // Generate a cryptographically random nonce per request for CSP.
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
