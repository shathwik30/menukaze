import { getMongoConnection, getModels, type DbName, type RestaurantDoc } from '@menukaze/db';
import type { HydratedDocument } from 'mongoose';
import { parseHost, type HostKind } from './host';

export type LoadedRestaurant = HydratedDocument<RestaurantDoc>;

export interface TenantRequestLocator {
  kind: HostKind['kind'];
  slug: string | null;
  host: string | null;
}

export function getTenantLocator(rawHeaders: Headers): TenantRequestLocator {
  const headerKind = rawHeaders.get('x-tenant-kind');
  const headerSlug = rawHeaders.get('x-tenant-slug');
  const headerHost = rawHeaders.get('x-tenant-host');

  if (headerKind === 'subdomain' || headerKind === 'custom') {
    return { kind: headerKind, slug: headerSlug, host: headerHost };
  }

  const parsed = parseHost(rawHeaders.get('host'));
  if (parsed.kind === 'subdomain') {
    return { kind: parsed.kind, slug: parsed.slug, host: null };
  }
  if (parsed.kind === 'custom') {
    return { kind: parsed.kind, slug: null, host: parsed.host };
  }

  return { kind: parsed.kind, slug: null, host: null };
}

export async function loadTenantRestaurantFromHeaders(
  rawHeaders: Headers,
  dbName: DbName = 'live',
): Promise<LoadedRestaurant | null> {
  const { kind, slug, host } = getTenantLocator(rawHeaders);
  const conn = await getMongoConnection(dbName);
  const { Restaurant } = getModels(conn);

  if (kind === 'subdomain' && slug) {
    return Restaurant.findOne({ slug }).exec();
  }
  if (kind === 'custom' && host) {
    return Restaurant.findOne({ customDomain: host }).exec();
  }

  return null;
}
