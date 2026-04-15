import { type NextRequest } from 'next/server';
import { getModels, getMongoConnection } from '@menukaze/db';
import { apiError, corsOptions, jsonOk, resolveApiKey } from '../_lib/auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS(): Promise<Response> {
  return corsOptions();
}

export async function GET(request: NextRequest): Promise<Response> {
  const ctx = await resolveApiKey(request);
  if (ctx instanceof Response) return ctx;

  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(ctx.restaurantId).lean().exec();
  if (!restaurant) return apiError('not_found', 'Restaurant not found.');

  return jsonOk({
    id: String(restaurant._id),
    slug: restaurant.slug,
    name: restaurant.name,
    description: restaurant.description ?? null,
    country: restaurant.country,
    currency: restaurant.currency,
    locale: restaurant.locale,
    timezone: restaurant.timezone,
    address: restaurant.addressStructured,
    phone: restaurant.phone ?? null,
    email: restaurant.email ?? null,
    logo_url: restaurant.logoUrl ?? null,
    hours: restaurant.hours,
    holiday_mode: restaurant.holidayMode ?? { enabled: false },
    estimated_prep_minutes: restaurant.estimatedPrepMinutes,
    minimum_order_minor: restaurant.minimumOrderMinor,
    delivery_fee_minor: restaurant.deliveryFeeMinor,
    is_live: Boolean(restaurant.liveAt),
    api_version: 'v1',
  });
}
