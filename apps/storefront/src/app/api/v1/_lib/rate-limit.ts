import 'server-only';
import { createRateLimiter, rateLimitHeaders, type RateLimitResult } from '@menukaze/rate-limit';
import { env } from '@/env';
import type { ApiKeyContext } from './auth';

const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_SECONDS = 60;

const limiter = createRateLimiter({
  prefix: 'menukaze:v1',
  limit: DEFAULT_LIMIT,
  windowSeconds: DEFAULT_WINDOW_SECONDS,
  redisUrl: env.UPSTASH_REDIS_REST_URL ?? null,
  redisToken: env.UPSTASH_REDIS_REST_TOKEN ?? null,
});

export type { RateLimitResult };
export { rateLimitHeaders };

export async function rateLimitFor(
  apiKey: ApiKeyContext,
  routeId: string,
): Promise<RateLimitResult> {
  return limiter(`${String(apiKey.keyId)}:${routeId}`);
}
