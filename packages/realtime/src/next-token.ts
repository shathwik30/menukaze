import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createRateLimiter, rateLimitHeaders } from '@menukaze/rate-limit';
import { ipFromHeaders } from '@menukaze/shared';
import { createAblyTokenRequest } from './server';

interface CustomerAblyTokenHandlerOptions {
  ratelimitPrefix: string;
  redisUrl?: string | null;
  redisToken?: string | null;
  paramName: string;
  loadChannel: (paramValue: string) => Promise<string | null>;
  limit?: number;
  windowSeconds?: number;
}

export function createCustomerAblyTokenHandler(
  options: CustomerAblyTokenHandlerOptions,
): (request: NextRequest) => Promise<NextResponse> {
  const limiter = createRateLimiter({
    prefix: options.ratelimitPrefix,
    limit: options.limit ?? 60,
    windowSeconds: options.windowSeconds ?? 60,
    redisUrl: options.redisUrl ?? null,
    redisToken: options.redisToken ?? null,
  });

  return async function handle(request: NextRequest): Promise<NextResponse> {
    const paramValue = request.nextUrl.searchParams.get(options.paramName);
    if (!paramValue) {
      return NextResponse.json(
        { error: `Missing or invalid ${options.paramName}` },
        { status: 400 },
      );
    }

    const ip = ipFromHeaders(request.headers) ?? 'unknown';
    const rl = await limiter(`ip:${ip}`);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const channel = await options.loadChannel(paramValue);
    if (!channel) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const tokenRequest = await createAblyTokenRequest({ [channel]: ['subscribe'] });
    return NextResponse.json(tokenRequest, { headers: rateLimitHeaders(rl) });
  };
}
