/**
 * Sliding-window rate limiter, shared across every Next.js app surface.
 *
 * Wraps `@upstash/ratelimit` + `@upstash/redis`. When the Upstash REST URL
 * or token is not configured the limiter is a no-op — local development
 * and CI jobs run fine without a Redis dependency. Production and staging
 * are expected to set both env vars.
 *
 * Usage:
 *
 *   const limiter = createRateLimiter({
 *     prefix: 'menukaze:v1',
 *     limit: 120,
 *     windowSeconds: 60,
 *   });
 *
 *   const result = await limiter('api_key:route');
 *   if (!result.ok) {
 *     return new Response(..., { status: 429, headers: rateLimitHeaders(result) });
 *   }
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimiterConfig {
  /** Cache-key prefix in Redis. Use one prefix per app surface. */
  prefix: string;
  /** Allowed requests per window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
  /**
   * Upstash REST URL. Defaults to `process.env.UPSTASH_REDIS_REST_URL`.
   * Pass `null` (or omit alongside an unset env var) to force the no-op
   * limiter — useful for tests.
   */
  redisUrl?: string | null;
  /** Upstash REST token. Defaults to `process.env.UPSTASH_REDIS_REST_TOKEN`. */
  redisToken?: string | null;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** UNIX epoch ms of when the bucket resets. */
  reset: number;
  /** Seconds the caller should wait before retrying. */
  retryAfterSeconds: number;
}

export type RateLimiter = (identifier: string) => Promise<RateLimitResult>;

function readEnv(value: string | null | undefined, envName: string): string | null {
  if (value === null) return null;
  if (value !== undefined) return value;
  return process.env[envName] ?? null;
}

/**
 * Build a sliding-window rate limiter. Returns a function that, given an
 * identifier (an API key id, an IP address, a tenant id, etc.), checks the
 * bucket and returns the limit headers.
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const url = readEnv(config.redisUrl, 'UPSTASH_REDIS_REST_URL');
  const token = readEnv(config.redisToken, 'UPSTASH_REDIS_REST_TOKEN');
  const limit = config.limit;

  if (!url || !token) {
    return async () => ({
      ok: true,
      limit,
      remaining: limit,
      reset: 0,
      retryAfterSeconds: 0,
    });
  }

  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, `${config.windowSeconds} s`),
    analytics: false,
    prefix: config.prefix,
  });

  return async (identifier: string) => {
    const { success, limit: actualLimit, remaining, reset } = await limiter.limit(identifier);
    const retryAfterSeconds = success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return {
      ok: success,
      limit: actualLimit,
      remaining,
      reset,
      retryAfterSeconds,
    };
  };
}

/**
 * Standard headers to attach to a 429 response. Attach to successful
 * responses too so clients can pre-emptively back off.
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
