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
  prefix: 'menukaze:ably:storefront',
  limit: 60,
  windowSeconds: 60,
  redisUrl: env.UPSTASH_REDIS_REST_URL ?? null,
  redisToken: env.UPSTASH_REDIS_REST_TOKEN ?? null,
});

/**
 * Token endpoint the browser's Ably Realtime client hits (via `authUrl`) to
 * get a short-lived token scoped to one order channel. The order id is the
 * only query param. We look the order up, confirm it belongs to the
 * current tenant, and mint a subscribe-only token for that single channel.
 *
 * Security model: order ids are 96-bit ObjectIds, functionally unguessable.
 * Knowing the id is equivalent to holding the receipt, which is how anybody
 * tracking the order would reach this URL in the first place.
 *
 * Rate-limited per IP to cap accidental polling and slow brute-force probes.
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

  const order = await Order.findOne({
    restaurantId: restaurant._id,
    _id: orderObjectId,
  }).exec();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const channel = channels.customerOrder(String(restaurant._id), orderId);
  const tokenRequest = await createAblyTokenRequest({ [channel]: ['subscribe'] });
  return NextResponse.json(tokenRequest, { headers: rateLimitHeaders(rl) });
}
