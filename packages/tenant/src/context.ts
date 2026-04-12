/**
 * Tenant context is the per-request object every handler reads to know which
 * restaurant the request belongs to. Constructed by the Next.js / tRPC / Hono
 * middleware after `parseHost(req.headers.host)` resolves a `restaurants` row.
 */

import { APIError } from '@menukaze/shared';
import { type DbName, getModels, getMongoConnection } from '@menukaze/db';
import type { RestaurantDoc } from '@menukaze/db';
import type { HydratedDocument } from 'mongoose';

export interface TenantContext {
  /** The 24-char hex id used as the foreign key on every tenant-scoped collection. */
  id: string;
  slug: string;
  /** Loaded restaurant document. Apps may stash a slim subset on cache hits. */
  restaurant: HydratedDocument<RestaurantDoc>;
  /** Selects which database (live vs sandbox) the request operates against. */
  dbName: DbName;
}

/**
 * Lookup a tenant by slug, throwing 404 if not found.
 */
export async function loadTenantBySlug(
  slug: string,
  dbName: DbName = 'live',
): Promise<TenantContext> {
  const conn = await getMongoConnection(dbName);
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findOne({ slug }).exec();
  if (!restaurant) {
    throw new APIError('not_found', { message: `No restaurant with slug ${slug}` });
  }
  return {
    id: String(restaurant._id),
    slug: restaurant.slug,
    restaurant,
    dbName,
  };
}

/**
 * Lookup a tenant by custom domain, throwing 404 if not found.
 */
export async function loadTenantByCustomDomain(
  host: string,
  dbName: DbName = 'live',
): Promise<TenantContext> {
  const conn = await getMongoConnection(dbName);
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findOne({ customDomain: host }).exec();
  if (!restaurant) {
    throw new APIError('not_found', { message: `No restaurant for host ${host}` });
  }
  return {
    id: String(restaurant._id),
    slug: restaurant.slug,
    restaurant,
    dbName,
  };
}
