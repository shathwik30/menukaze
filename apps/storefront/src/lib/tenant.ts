import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { loadTenantRestaurantFromHeaders, type LoadedRestaurant } from '@menukaze/tenant/request';

export type { LoadedRestaurant };

/**
 * Resolve the tenant for the current request.
 *
 * Reads the `x-tenant-slug` / `x-tenant-host` headers stamped by the edge
 * middleware, looks up the restaurant in the live DB, and returns it. If the
 * middleware classified the host as reserved / apex / invalid, or if no
 * restaurant matches, renders the Next.js not-found page.
 */
export async function resolveTenantOrNotFound(): Promise<LoadedRestaurant> {
  const restaurant = await loadTenantRestaurantFromHeaders(await headers());

  if (!restaurant) notFound();
  return restaurant;
}
