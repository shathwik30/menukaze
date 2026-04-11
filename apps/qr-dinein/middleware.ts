import { type NextRequest, NextResponse } from 'next/server';
import { parseHost } from '@menukaze/tenant/host';

export function middleware(request: NextRequest): NextResponse {
  const parsed = parseHost(request.headers.get('host'));
  const headers = new Headers(request.headers);
  headers.set('x-tenant-kind', parsed.kind);
  if (parsed.kind === 'subdomain') headers.set('x-tenant-slug', parsed.slug);
  if (parsed.kind === 'custom') headers.set('x-tenant-host', parsed.host);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
