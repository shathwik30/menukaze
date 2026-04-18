import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { channels } from '@menukaze/realtime';
import { createCustomerAblyTokenHandler } from '@menukaze/realtime/next-token';
import { env } from '@/env';
import { resolveTenantOrNotFound } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export const GET = createCustomerAblyTokenHandler({
  ratelimitPrefix: 'menukaze:ably:kiosk',
  redisUrl: env.UPSTASH_REDIS_REST_URL ?? null,
  redisToken: env.UPSTASH_REDIS_REST_TOKEN ?? null,
  paramName: 'orderId',
  loadChannel: async (orderId) => {
    const orderObjectId = parseObjectId(orderId);
    if (!orderObjectId) return null;
    const restaurant = await resolveTenantOrNotFound();
    const conn = await getMongoConnection('live');
    const { Order } = getModels(conn);
    const order = await Order.findOne({ restaurantId: restaurant._id, _id: orderObjectId }, null, {
      skipTenantGuard: true,
    }).exec();
    if (!order) return null;
    return channels.customerOrder(String(restaurant._id), orderId);
  },
});
