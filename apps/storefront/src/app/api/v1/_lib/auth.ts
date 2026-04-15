import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getModels, getMongoConnection, hashApiKey, type ApiKeyDoc } from '@menukaze/db';
import { ERROR_CODES, type ErrorCode } from '@menukaze/shared';
import type { Types } from 'mongoose';

export interface ApiKeyContext {
  keyId: Types.ObjectId;
  restaurantId: Types.ObjectId;
  scope: ApiKeyDoc['scope'];
  env: ApiKeyDoc['env'];
  channel: { id: string; name: string; icon: string | null; color: string | null };
}

/**
 * Public API errors are a subset of the canonical {@link ErrorCode} registry
 * in `@menukaze/shared`. The narrow union prevents `/api/v1/*` routes from
 * accidentally surfacing internal-only error codes (e.g. `tenant_context_missing`).
 */
export type ApiResponseError = Extract<
  ErrorCode,
  | 'invalid_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'idempotency_conflict'
  | 'order_items_empty'
  | 'item_unavailable'
  | 'restaurant_closed'
  | 'below_minimum_order'
  | 'delivery_zone_not_covered'
  | 'rate_limit_exceeded'
  | 'internal_error'
  | 'service_unavailable'
>;

export function apiError(
  code: ApiResponseError,
  message: string,
  init?: ResponseInit,
): NextResponse {
  const status = ERROR_CODES[code].status;
  return NextResponse.json({ error: { code, message, status } }, { status, ...(init ?? {}) });
}

export function jsonOk<T>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init);
}

const KEY_HEADER = 'x-menukaze-key';

/**
 * Resolve the `X-Menukaze-Key` header to an active ApiKey document. Returns
 * a NextResponse on failure (caller returns it directly), or the resolved
 * context. Updates lastUsedAt + requestCount asynchronously.
 *
 * Required scopes:
 *   - GET endpoints: any
 *   - Write endpoints: read_write or admin
 */
export async function resolveApiKey(
  request: NextRequest,
  required: 'read' | 'write' | 'admin' = 'read',
): Promise<ApiKeyContext | NextResponse> {
  const headerValue = request.headers.get(KEY_HEADER);
  if (!headerValue) {
    return apiError('unauthenticated', 'Missing X-Menukaze-Key header.');
  }
  const trimmed = headerValue.trim();
  if (!/^mk_(test|live)_[A-Za-z0-9_-]+$/.test(trimmed)) {
    return apiError('unauthenticated', 'Malformed API key.');
  }
  const hash = hashApiKey(trimmed);

  const conn = await getMongoConnection('live');
  const { ApiKey, Restaurant } = getModels(conn);
  const key = await ApiKey.findOne({ keyHash: hash }, null, { skipTenantGuard: true }).exec();
  if (!key) return apiError('unauthenticated', 'Unknown API key.');
  if (key.revokedAt) return apiError('unauthenticated', 'API key has been revoked.');
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
    return apiError('unauthenticated', 'API key has expired.');
  }

  if (required === 'write' && key.scope === 'read_only') {
    return apiError('forbidden', 'Key lacks write scope.');
  }
  if (required === 'admin' && key.scope !== 'admin') {
    return apiError('forbidden', 'Key lacks admin scope.');
  }

  if (key.allowedOrigins.length > 0) {
    const origin = request.headers.get('origin');
    if (origin && !key.allowedOrigins.includes(origin)) {
      return apiError('forbidden', 'Origin not in allowlist.');
    }
  }

  // Verify the restaurant still exists.
  const restaurant = await Restaurant.findById(key.restaurantId, {
    name: 1,
    liveAt: 1,
    holidayMode: 1,
  })
    .lean()
    .exec();
  if (!restaurant) return apiError('not_found', 'Restaurant not found.');

  // Best-effort usage update; don't await to keep the response fast.
  void ApiKey.updateOne(
    { _id: key._id },
    { $set: { lastUsedAt: new Date() }, $inc: { requestCount: 1 } },
  ).exec();

  return {
    keyId: key._id,
    restaurantId: key.restaurantId,
    scope: key.scope,
    env: key.env,
    channel: {
      id: String(key._id),
      name: key.name,
      icon: key.icon ?? null,
      color: key.color ?? null,
    },
  };
}

/**
 * Standard CORS preflight. Allowlist is per-key, so for OPTIONS we accept
 * any origin and let the actual request handler enforce the allowlist
 * once the API key resolves.
 */
export function corsOptions(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Menukaze-Key, Idempotency-Key',
      'Access-Control-Max-Age': '3600',
    },
  });
}
