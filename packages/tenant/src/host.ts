/**
 * Host parser. Given an HTTP `Host` header, returns either a Menukaze
 * subdomain (`{slug}.menukaze.com`) or a custom-domain marker so the caller
 * knows whether to look the tenant up by slug or by customDomain.
 */

export type HostKind =
  | { kind: 'subdomain'; slug: string }
  | { kind: 'reserved'; subdomain: ReservedSubdomain }
  | { kind: 'custom'; host: string }
  | { kind: 'apex' }
  | { kind: 'invalid' };

export type ReservedSubdomain = 'www' | 'admin' | 'api' | 'sandbox-api' | 'status';

const RESERVED: ReservedSubdomain[] = ['www', 'admin', 'api', 'sandbox-api', 'status'];
const RESERVED_SET: ReadonlySet<string> = new Set(RESERVED);

function isReservedSubdomain(value: string): value is ReservedSubdomain {
  return RESERVED_SET.has(value);
}

const APEX_DOMAINS = new Set([
  'menukaze.com',
  'menukaze.dev',
  'localhost',
  'localhost.menukaze.dev',
]);

/**
 * Strip port + lowercase the host header.
 *
 * Examples:
 *   "joes-pizza.menukaze.com:443" → "joes-pizza.menukaze.com"
 *   "JOES.MENUKAZE.COM"           → "joes.menukaze.com"
 */
export function normalizeHost(host: string): string {
  return host.toLowerCase().split(':')[0] ?? '';
}

/**
 * Parse a request host into one of:
 *   - reserved subdomain (admin, api, etc.) — route to platform apps
 *   - tenant subdomain (`{slug}.menukaze.com`) — route to tenant by slug
 *   - apex (`menukaze.com`) — route to marketing/landing
 *   - custom domain — caller must look up `restaurants.customDomain`
 *   - invalid — return 404
 */
export function parseHost(rawHost: string | null | undefined): HostKind {
  if (!rawHost) return { kind: 'invalid' };
  const host = normalizeHost(rawHost);
  if (!host) return { kind: 'invalid' };

  if (APEX_DOMAINS.has(host)) return { kind: 'apex' };

  // Match `<sub>.menukaze.{com,dev}` or `<sub>.localhost.menukaze.dev`
  for (const apex of APEX_DOMAINS) {
    const suffix = '.' + apex;
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      if (!sub || sub.includes('.')) continue; // multi-level subdomain → keep looking
      if (isReservedSubdomain(sub)) {
        return { kind: 'reserved', subdomain: sub };
      }
      return { kind: 'subdomain', slug: sub };
    }
  }

  return { kind: 'custom', host };
}
