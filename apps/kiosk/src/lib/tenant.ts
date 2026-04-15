import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { loadTenantRestaurantFromHeaders, type LoadedRestaurant } from '@menukaze/tenant/request';
import { env } from '@/env';

export type { LoadedRestaurant };

export async function resolveTenantOrNotFound(): Promise<LoadedRestaurant> {
  const restaurant =
    (await loadTenantRestaurantFromHeaders(await headers())) ?? (await loadLocalKioskRestaurant());
  if (!restaurant) notFound();
  return restaurant;
}

async function loadLocalKioskRestaurant(): Promise<LoadedRestaurant | null> {
  const slug = env.KIOSK_RESTAURANT_SLUG?.trim();
  if (!slug) return null;

  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  return Restaurant.findOne({ slug }).exec();
}
