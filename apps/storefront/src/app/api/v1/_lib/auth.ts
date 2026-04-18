import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import {
  getModels,
  getMongoConnection,
  hashApiKey,
  type ApiKeyDoc,
  type DbName,
} from '@menukaze/db';
import { ERROR_CODES, type ErrorCode } from '@menukaze/shared';
import type { Types } from 'mongoose';

export interface ApiKeyContext {
  keyId: Types.ObjectId;
  restaurantId: Types.ObjectId;
  dbName: DbName;
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
const ALLOW_METHODS = 'GET,POST,OPTIONS';
const ALLOW_HEADERS = 'Content-Type, X-Menukaze-Key, Idempotency-Key';

export function dbNameForApiKeyEnv(env: ApiKeyDoc['env']): DbName {
  return env === 'test' ? 'sandbox' : 'live';
}

function appendVary(response: NextResponse, value: string): void {
  const existing = response.headers.get('Vary');
  if (!existing) {
    response.headers.set('Vary', value);
    return;
  }
  const parts = new Set(existing.split(',').map((part) => part.trim().toLowerCase()));
  if (!parts.has(value.toLowerCase())) {
    response.headers.set('Vary', `${existing}, ${value}`);
  }
}

export function withApiCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin');
  response.headers.set('Access-Control-Allow-Origin', origin ?? '*');
  response.headers.set('Access-Control-Allow-Methods', ALLOW_METHODS);
  response.headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
  response.headers.set('Access-Control-Max-Age', '3600');
  if (origin) appendVary(response, 'Origin');
  return response;
}

export function apiErrorForRequest(
  request: NextRequest,
  code: ApiResponseError,
  message: string,
  init?: ResponseInit,
): NextResponse {
  return withApiCors(request, apiError(code, message, init));
}

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
    return apiErrorForRequest(request, 'unauthenticated', 'Missing X-Menukaze-Key header.');
  }
  const trimmed = headerValue.trim();
  if (!/^mk_(test|live)_[A-Za-z0-9_-]+$/.test(trimmed)) {
    return apiErrorForRequest(request, 'unauthenticated', 'Malformed API key.');
  }
  const hash = hashApiKey(trimmed);

  const keyConn = await getMongoConnection('live');
  const { ApiKey } = getModels(keyConn);
  const key = await ApiKey.findOne({ keyHash: hash }, null, { skipTenantGuard: true }).exec();
  if (!key) return apiErrorForRequest(request, 'unauthenticated', 'Unknown API key.');
  if (key.revokedAt) {
    return apiErrorForRequest(request, 'unauthenticated', 'API key has been revoked.');
  }
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
    return apiErrorForRequest(request, 'unauthenticated', 'API key has expired.');
  }

  if (required === 'write' && key.scope === 'read_only') {
    return apiErrorForRequest(request, 'forbidden', 'Key lacks write scope.');
  }
  if (required === 'admin' && key.scope !== 'admin') {
    return apiErrorForRequest(request, 'forbidden', 'Key lacks admin scope.');
  }

  if (key.allowedOrigins.length > 0) {
    const origin = request.headers.get('origin');
    if (origin && !key.allowedOrigins.includes(origin)) {
      return apiErrorForRequest(request, 'forbidden', 'Origin not in allowlist.');
    }
  }

  const dbName = dbNameForApiKeyEnv(key.env);
  const resourceConn = dbName === 'live' ? keyConn : await getMongoConnection(dbName);
  const { Restaurant } = getModels(resourceConn);

  // Verify the restaurant still exists in the DB this key operates against.
  const restaurant = await Restaurant.findById(key.restaurantId, {
    name: 1,
    liveAt: 1,
    holidayMode: 1,
  })
    .lean()
    .exec();
  if (!restaurant) return apiErrorForRequest(request, 'not_found', 'Restaurant not found.');

  // Best-effort usage update; don't await to keep the response fast.
  void ApiKey.updateOne(
    { _id: key._id },
    { $set: { lastUsedAt: new Date() }, $inc: { requestCount: 1 } },
  ).exec();

  return {
    keyId: key._id,
    restaurantId: key.restaurantId,
    dbName,
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
export function corsOptions(request?: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  const origin = request?.headers.get('origin');
  response.headers.set('Access-Control-Allow-Origin', origin ?? '*');
  response.headers.set('Access-Control-Allow-Methods', ALLOW_METHODS);
  response.headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
  response.headers.set('Access-Control-Max-Age', '3600');
  if (origin) appendVary(response, 'Origin');
  return response;
}
