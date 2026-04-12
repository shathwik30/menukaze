import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels, type RestaurantDoc } from '@menukaze/db';
import { parseHost, type HostKind } from '@menukaze/tenant/host';
import type { HydratedDocument } from 'mongoose';

export type LoadedRestaurant = HydratedDocument<RestaurantDoc>;

function getTenantLocator(rawHeaders: Headers): {
  kind: HostKind['kind'];
  slug: string | null;
  host: string | null;
} {
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

/**
 * Resolve the tenant for the current request.
 *
 * Reads the `x-tenant-slug` / `x-tenant-host` headers stamped by the edge
 * middleware, looks up the restaurant in the live DB, and returns it. If the
 * middleware classified the host as reserved / apex / invalid, or if no
 * restaurant matches, renders the Next.js not-found page.
 */
export async function resolveTenantOrNotFound(): Promise<LoadedRestaurant> {
  const h = await headers();
  const { kind, slug, host } = getTenantLocator(h);

  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);

  let restaurant: LoadedRestaurant | null = null;
  if (kind === 'subdomain' && slug) {
    restaurant = await Restaurant.findOne({ slug }).exec();
  } else if (kind === 'custom' && host) {
    restaurant = await Restaurant.findOne({ customDomain: host }).exec();
  }

  if (!restaurant) notFound();
  return restaurant;
}
