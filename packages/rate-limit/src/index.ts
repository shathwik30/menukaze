import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimiterConfig {
  prefix: string;
  limit: number;
  windowSeconds: number;
  /** Pass `null` (or omit with env unset) to force the no-op limiter — useful for tests. */
  redisUrl?: string | null;
  redisToken?: string | null;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** UNIX epoch ms of when the bucket resets. */
  reset: number;
  retryAfterSeconds: number;
}

export type RateLimiter = (identifier: string) => Promise<RateLimitResult>;

function readEnv(value: string | null | undefined, envName: string): string | null {
  if (value === null) return null;
  if (value !== undefined) return value;
  return process.env[envName] ?? null;
}

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

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
  };
  if (result.reset) headers['X-RateLimit-Reset'] = String(result.reset);
  if (!result.ok) headers['Retry-After'] = String(result.retryAfterSeconds);
  return headers;
}
