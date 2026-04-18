import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { loadTenantRestaurantFromHeaders, type LoadedRestaurant } from '@menukaze/tenant/request';

export type { LoadedRestaurant };

export async function resolveTenantOrNotFound(): Promise<LoadedRestaurant> {
  const restaurant = await loadTenantRestaurantFromHeaders(await headers());

  if (!restaurant) notFound();
  return restaurant;
}
