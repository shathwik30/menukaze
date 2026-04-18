import { type NextRequest, NextResponse } from 'next/server';
import { parseHost } from './host';

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
const HSTS_VALUE = 'max-age=63072000; includeSubDomains; preload';

export interface TenantMiddlewareOptions {
  /** Stamp x-tenant-* headers for downstream server code. Default true. Super-admin sets false. */
  parseTenant?: boolean;
  /** Replaces the entire baseline CSP directive map. */
  csp?: CspMap;
  /** Space-separated values appended to baseline directives. Ignored when `csp` is set. */
  cspAppend?: CspMap;
  hsts?: boolean;
  frameOptions?: boolean;
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
    if (hsts) response.headers.set('Strict-Transport-Security', HSTS_VALUE);
    if (frameOptions) response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
  }

  return { middleware, config: { matcher } };
}
