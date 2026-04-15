import { NextResponse, type NextRequest } from 'next/server';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { createRateLimiter, rateLimitHeaders } from '@menukaze/rate-limit';
import { channels } from '@menukaze/realtime';
import { createAblyTokenRequest } from '@menukaze/realtime/server';
import { ipFromHeaders } from '@menukaze/shared';
import { env } from '@/env';
import { resolveTenantOrNotFound } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const ablyTokenLimiter = createRateLimiter({
  prefix: 'menukaze:ably:kiosk',
  limit: 60,
  windowSeconds: 60,
  redisUrl: env.UPSTASH_REDIS_REST_URL ?? null,
  redisToken: env.UPSTASH_REDIS_REST_TOKEN ?? null,
});

/**
 * Mints a short-lived Ably token scoped to one kiosk order channel.
 * Called by the confirm screen's Ably client to track order status.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const orderId = request.nextUrl.searchParams.get('orderId');
  const orderObjectId = orderId ? parseObjectId(orderId) : null;
  if (!orderObjectId || !orderId) {
    return NextResponse.json({ error: 'Missing or invalid orderId' }, { status: 400 });
  }

  const ip = ipFromHeaders(request.headers) ?? 'unknown';
  const rl = await ablyTokenLimiter(`ip:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const restaurant = await resolveTenantOrNotFound();
  const conn = await getMongoConnection('live');
  const { Order } = getModels(conn);

  const order = await Order.findOne({ restaurantId: restaurant._id, _id: orderObjectId }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const channel = channels.customerOrder(String(restaurant._id), orderId);
  const tokenRequest = await createAblyTokenRequest({ [channel]: ['subscribe'] });
  return NextResponse.json(tokenRequest, { headers: rateLimitHeaders(rl) });
}
