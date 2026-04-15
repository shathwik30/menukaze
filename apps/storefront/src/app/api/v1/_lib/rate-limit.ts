import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@/env';
import type { ApiKeyContext } from './auth';

/**
 * Sliding-window rate limiter for the public `/api/v1/*` surface, keyed by
 * API key + route. If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 * aren't configured the limiter is a no-op — this lets local development
 * and unrelated CI jobs proceed without a Redis dependency. Production and
 * staging are expected to set both vars.
 *
 * Limits are intentionally conservative and shared across the v1 route
 * surface.
 */

const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_SECONDS = 60;

let limiterPromise: Promise<Ratelimit | null> | null = null;

async function getLimiter(): Promise<Ratelimit | null> {
  if (limiterPromise) return limiterPromise;
  limiterPromise = (async () => {
    const url = env.UPSTASH_REDIS_REST_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    const redis = new Redis({ url, token });
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(DEFAULT_LIMIT, `${DEFAULT_WINDOW_SECONDS} s`),
      analytics: false,
      prefix: 'menukaze:v1',
    });
  })();
  return limiterPromise;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfterSeconds: number;
}

/**
 * Check the rate limit for a given API key + route. Returns `ok: true` when
 * not configured (see module comment).
 */
export async function rateLimitFor(
  apiKey: ApiKeyContext,
  routeId: string,
): Promise<RateLimitResult> {
  const limiter = await getLimiter();
  if (!limiter) {
    return {
      ok: true,
      limit: DEFAULT_LIMIT,
      remaining: DEFAULT_LIMIT,
      reset: 0,
      retryAfterSeconds: 0,
    };
  }
  const identifier = `${String(apiKey.keyId)}:${routeId}`;
  const { success, limit, remaining, reset } = await limiter.limit(identifier);
  const retryAfterSeconds = success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return { ok: success, limit, remaining, reset, retryAfterSeconds };
}

/**
 * Standard headers to attach to a 429 response. Attach to successful
 * response too so clients can pre-emptively back off.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
  };
  if (result.reset) headers['X-RateLimit-Reset'] = String(result.reset);
  if (!result.ok) headers['Retry-After'] = String(result.retryAfterSeconds);
  return headers;
}
