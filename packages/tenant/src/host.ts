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

const APEX_DOMAINS = new Set(['menukaze.com', 'menukaze.dev', 'localhost']);

export function normalizeHost(host: string): string {
  return host.toLowerCase().split(':')[0] ?? '';
}

export function parseHost(rawHost: string | null | undefined): HostKind {
  if (!rawHost) return { kind: 'invalid' };
  const host = normalizeHost(rawHost);
  if (!host) return { kind: 'invalid' };

  if (APEX_DOMAINS.has(host)) return { kind: 'apex' };

  for (const apex of APEX_DOMAINS) {
    const suffix = '.' + apex;
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      // Reject multi-level subdomains (e.g. a.b.menukaze.com).
      if (!sub || sub.includes('.')) continue;
      if (isReservedSubdomain(sub)) {
        return { kind: 'reserved', subdomain: sub };
      }
      return { kind: 'subdomain', slug: sub };
    }
  }

  return { kind: 'custom', host };
}
