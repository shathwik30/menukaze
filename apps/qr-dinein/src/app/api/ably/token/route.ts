import { NextResponse, type NextRequest } from 'next/server';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { createRateLimiter, rateLimitHeaders } from '@menukaze/rate-limit';
import { channels } from '@menukaze/realtime';
import { createAblyTokenRequest } from '@menukaze/realtime/server';
import { ipFromHeaders } from '@menukaze/shared';
import { env } from '@/env';

export const dynamic = 'force-dynamic';

const ablyTokenLimiter = createRateLimiter({
  prefix: 'menukaze:ably:qr',
  limit: 60,
  windowSeconds: 60,
  redisUrl: env.UPSTASH_REDIS_REST_URL ?? null,
  redisToken: env.UPSTASH_REDIS_REST_TOKEN ?? null,
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const sessionObjectId = sessionId ? parseObjectId(sessionId) : null;
  if (!sessionId || !sessionObjectId) {
    return NextResponse.json({ error: 'Unknown session.' }, { status: 400 });
  }

  const ip = ipFromHeaders(request.headers) ?? 'unknown';
  const rl = await ablyTokenLimiter(`ip:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const conn = await getMongoConnection('live');
  const { TableSession } = getModels(conn);
  const session = await TableSession.findOne({ _id: sessionObjectId }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!session) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  const channel = channels.customerSession(String(session.restaurantId), sessionId);
  const tokenRequest = await createAblyTokenRequest({ [channel]: ['subscribe'] });
  return NextResponse.json(tokenRequest, { headers: rateLimitHeaders(rl) });
}
