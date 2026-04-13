import { type NextRequest, NextResponse } from 'next/server';

/**
 * Build a nonce-based Content-Security-Policy header value.
 * Super-admin has no third-party script needs (no Razorpay/Ably), so the
 * policy is tighter than the dashboard's.
 */
function buildCsp(nonce: string): string {
  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': `'self' 'nonce-${nonce}' 'strict-dynamic'`,
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: blob:",
    'font-src': "'self' data:",
    'connect-src': "'self'",
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
  const reqHeaders = new Headers(request.headers);

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
