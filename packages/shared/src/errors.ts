/**
 * Menukaze error code registry. The single source of truth for the error envelope
 * shape that crosses the public API boundary (Hono /v1) and the internal tRPC layer.
 *
 * Every error returned to a client follows: { error: { code, message, status } }.
 */

export const ERROR_CODES = {
  // 400
  invalid_request: {
    status: 400,
    message: 'The request body is malformed or missing required fields.',
  },
  // 401
  unauthenticated: { status: 401, message: 'Authentication credentials are missing or invalid.' },
  // 403
  forbidden: { status: 403, message: 'You do not have permission to perform this action.' },
  out_of_geofence: {
    status: 403,
    message: 'It looks like you are not at the restaurant. Please ask your server for help.',
  },
  fingerprint_rate_limit: {
    status: 403,
    message: 'Too many sessions from this device. Please ask your server for help.',
  },
  // 404
  not_found: { status: 404, message: 'The requested resource does not exist.' },
  // 409
  idempotency_conflict: {
    status: 409,
    message: 'Idempotency key reused with a different request body.',
  },
  conflict: {
    status: 409,
    message: 'The request conflicts with the current state of the resource.',
  },
  // 422
  order_items_empty: { status: 422, message: 'The order must contain at least one item.' },
  item_unavailable: { status: 422, message: 'One or more items are sold out.' },
  restaurant_closed: { status: 422, message: 'The restaurant is currently closed.' },
  below_minimum_order: {
    status: 422,
    message: 'The order total is below the minimum order amount.',
  },
  delivery_zone_not_covered: { status: 422, message: 'This address is outside the delivery zone.' },
  validation_failed: { status: 422, message: 'One or more fields failed validation.' },
  // 429
  rate_limit_exceeded: { status: 429, message: 'Rate limit exceeded. See Retry-After header.' },
  // 500
  internal_error: {
    status: 500,
    message: 'An unexpected error occurred. Safe to retry with exponential backoff.',
  },
  // 503
  service_unavailable: { status: 503, message: 'Service is temporarily unavailable.' },
  // Tenant-context internal
  tenant_context_missing: {
    status: 500,
    message: 'Tenant context was not set on the request. This is a bug.',
  },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    status: number;
    details?: unknown;
  };
}

/**
 * The single error class thrown across every layer of the system.
 * Anything that crosses an API boundary is converted into an `ErrorEnvelope` by
 * the framework's error middleware (Hono or tRPC).
 */
export class APIError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details: unknown;

  public constructor(
    code: ErrorCode,
    opts: { message?: string; details?: unknown; cause?: unknown } = {},
  ) {
    const def = ERROR_CODES[code];
    super(opts.message ?? def.message, { cause: opts.cause });
    this.name = 'APIError';
    this.code = code;
    this.status = def.status;
    this.details = opts.details;
  }

  public toEnvelope(): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        ...(this.details !== undefined && { details: this.details }),
      },
    };
  }
}

function isErrorRecord(error: unknown): error is Error & { code: unknown; status: unknown } {
  return error instanceof Error && 'code' in error && 'status' in error;
}

/** Type guard so frameworks can detect APIError without `instanceof` failing across realms. */
export function isAPIError(error: unknown): error is APIError {
  return (
    isErrorRecord(error) &&
    typeof error.code === 'string' &&
    error.code in ERROR_CODES &&
    typeof error.status === 'number'
  );
}
