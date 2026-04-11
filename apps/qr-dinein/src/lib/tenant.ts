import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels, type RestaurantDoc } from '@menukaze/db';
import type { HydratedDocument } from 'mongoose';

export type LoadedRestaurant = HydratedDocument<RestaurantDoc>;

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
  const kind = h.get('x-tenant-kind');
  const slug = h.get('x-tenant-slug');
  const host = h.get('x-tenant-host');

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
