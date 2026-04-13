import { type NextRequest, NextResponse } from 'next/server';
import { parseHost } from '@menukaze/tenant/host';

function buildCsp(nonce: string): string {
  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': `'self' 'nonce-${nonce}' 'strict-dynamic' https://checkout.razorpay.com`,
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: blob: https://utfs.io https://cdn.razorpay.com",
    'font-src': "'self' data:",
    'connect-src':
      "'self' https://realtime.ably.io wss://realtime.ably.io https://rest.ably.io https://api.razorpay.com https://lumberjack.razorpay.com",
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

  // A kiosk device is always locked to one restaurant. When running on
  // localhost (apex) or when no subdomain can be parsed, fall back to the
  // KIOSK_RESTAURANT_SLUG env var so the tenant is resolved automatically.
  const fallbackSlug = process.env['KIOSK_RESTAURANT_SLUG'];

  if (parsed.kind === 'subdomain') {
    reqHeaders.set('x-tenant-kind', 'subdomain');
    reqHeaders.set('x-tenant-slug', parsed.slug);
  } else if (parsed.kind === 'custom') {
    reqHeaders.set('x-tenant-kind', 'custom');
    reqHeaders.set('x-tenant-host', parsed.host);
  } else if (fallbackSlug) {
    // apex / localhost — inject the hardcoded restaurant slug
    reqHeaders.set('x-tenant-kind', 'subdomain');
    reqHeaders.set('x-tenant-slug', fallbackSlug);
  } else {
    reqHeaders.set('x-tenant-kind', parsed.kind);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  reqHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: reqHeaders } });
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
