import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { channels } from '@menukaze/realtime';
import { createCustomerAblyTokenHandler } from '@menukaze/realtime/next-token';
import { env } from '@/env';

export const dynamic = 'force-dynamic';

export const GET = createCustomerAblyTokenHandler({
  ratelimitPrefix: 'menukaze:ably:qr',
  redisUrl: env.UPSTASH_REDIS_REST_URL ?? null,
  redisToken: env.UPSTASH_REDIS_REST_TOKEN ?? null,
  paramName: 'sessionId',
  loadChannel: async (sessionId) => {
    const sessionObjectId = parseObjectId(sessionId);
    if (!sessionObjectId) return null;
    const conn = await getMongoConnection('live');
    const { TableSession } = getModels(conn);
    const session = await TableSession.findOne({ _id: sessionObjectId }, null, {
      skipTenantGuard: true,
    }).exec();
    if (!session) return null;
    return channels.customerSession(String(session.restaurantId), sessionId);
  },
});
