import { APIError } from '@menukaze/shared';
import { type DbName, getModels, getMongoConnection } from '@menukaze/db';
import type { RestaurantDoc } from '@menukaze/db';
import type { HydratedDocument } from 'mongoose';

export interface TenantContext {
  id: string;
  slug: string;
  restaurant: HydratedDocument<RestaurantDoc>;
  dbName: DbName;
}

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
