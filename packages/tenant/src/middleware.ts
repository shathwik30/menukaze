import { type NextRequest, NextResponse } from 'next/server';
import { parseHost } from './host';

/**
 * Edge-runtime middleware factory for the Menukaze Next.js apps.
 *
 * Handles the cross-cutting concerns every app repeats:
 *   1. Parse the request host into tenant headers (x-tenant-kind, x-tenant-slug,
 *      x-tenant-host) so server components downstream can resolve the tenant
 *      in the Node runtime (where Mongoose works).
 *   2. Mint a per-request CSP nonce and stamp it as `x-nonce`.
 *   3. Build a Content-Security-Policy header using a baseline directive map
 *      that apps can append to or replace.
 *   4. Apply the standard security headers (HSTS, X-Frame-Options,
 *      X-Content-Type-Options, Referrer-Policy).
 *
 * Each app's middleware.ts becomes a two-line consumer:
 *
 *   export const { middleware, config } = createTenantMiddleware({ ... });
 */

type CspDirective =
  | 'default-src'
  | 'script-src'
  | 'style-src'
  | 'img-src'
  | 'font-src'
  | 'connect-src'
  | 'frame-src'
  | 'object-src'
  | 'base-uri'
  | 'frame-ancestors'
  | 'upgrade-insecure-requests';

type CspMap = Partial<Record<CspDirective, string>>;

const BASELINE_CSP: CspMap = {
  'default-src': "'self'",
  'script-src': "'self' 'nonce-{nonce}' 'strict-dynamic'",
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

const DEFAULT_MATCHER = ['/((?!_next/static|_next/image|favicon.ico).*)'];

export interface TenantMiddlewareOptions {
  /**
   * Parse the request host and stamp x-tenant-* headers. Default `true`.
   * Super-admin sets this to `false` because it isn't tenant-scoped.
   */
  parseTenant?: boolean;
  /**
   * If provided, replaces the entire baseline CSP directive map. Use for
   * tightened internal apps that don't need Razorpay/Ably/image hosts.
   */
  csp?: CspMap;
  /**
   * Append values to specific baseline CSP directives (space-separated).
   * Ignored if `csp` is set. Useful for adding third-party hosts to one or
   * two directives without restating the whole policy.
   */
  cspAppend?: CspMap;
  /** Include `Strict-Transport-Security`. Default `true`. */
  hsts?: boolean;
  /** Include `X-Frame-Options: DENY`. Default `true`. */
  frameOptions?: boolean;
  /**
   * Next.js route matcher. Defaults to excluding `_next/static`,
   * `_next/image`, and `favicon.ico`. Apps that also want to skip static
   * files like robots.txt pass their own pattern here.
   */
  matcher?: string[];
}

function renderCsp(map: CspMap, nonce: string): string {
  return Object.entries(map)
    .map(([directive, value]) => {
      const rendered = (value ?? '').replaceAll('{nonce}', nonce).trim();
      return rendered ? `${directive} ${rendered}` : directive;
    })
    .join('; ');
}

function mergeAppend(base: CspMap, append: CspMap): CspMap {
  const merged: CspMap = { ...base };
  for (const [directive, value] of Object.entries(append)) {
    if (!value) continue;
    const key = directive as CspDirective;
    const existing = merged[key];
    merged[key] = existing ? `${existing} ${value}` : value;
  }
  return merged;
}

export function createTenantMiddleware(options: TenantMiddlewareOptions = {}): {
  middleware: (request: NextRequest) => NextResponse;
  config: { matcher: string[] };
} {
  const parseTenant = options.parseTenant ?? true;
  const hsts = options.hsts ?? true;
  const frameOptions = options.frameOptions ?? true;
  const matcher = options.matcher ?? DEFAULT_MATCHER;
  const cspMap = options.csp ?? mergeAppend(BASELINE_CSP, options.cspAppend ?? {});

  function middleware(request: NextRequest): NextResponse {
    const reqHeaders = new Headers(request.headers);

    if (parseTenant) {
      const parsed = parseHost(request.headers.get('host'));
      reqHeaders.set('x-tenant-kind', parsed.kind);
      if (parsed.kind === 'subdomain') reqHeaders.set('x-tenant-slug', parsed.slug);
      if (parsed.kind === 'custom') reqHeaders.set('x-tenant-host', parsed.host);
    }

    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    reqHeaders.set('x-nonce', nonce);

    const response = NextResponse.next({ request: { headers: reqHeaders } });

    response.headers.set('Content-Security-Policy', renderCsp(cspMap, nonce));
    if (hsts) {
      response.headers.set(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload',
      );
    }
    if (frameOptions) {
      response.headers.set('X-Frame-Options', 'DENY');
    }
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
  }

  return { middleware, config: { matcher } };
}
