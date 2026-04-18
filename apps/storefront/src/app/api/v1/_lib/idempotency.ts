import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { Connection } from 'mongoose';
import type { ApiKeyContext } from './auth';
import { apiError } from './auth';

const HEADER = 'idempotency-key';
const COLLECTION = 'api_idempotency_records';
const MAX_KEY_LENGTH = 128;
const TTL_MS = 24 * 60 * 60 * 1000;

interface StoredResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface IdempotencyRecord {
  scope: string;
  requestHash: string;
  status: 'pending' | 'completed';
  response?: StoredResponse;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

interface WithIdempotencyInput {
  request: NextRequest;
  ctx: ApiKeyContext;
  connection: Connection;
  routeId: string;
  body: unknown;
  handler: () => Promise<NextResponse>;
}

const indexedConnections = new WeakSet<Connection>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function hashIdempotencyBody(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(body)))
    .digest('hex');
}

export function createIdempotencyScope(
  ctx: Pick<ApiKeyContext, 'dbName' | 'restaurantId' | 'keyId'>,
  routeId: string,
  key: string,
): string {
  return [ctx.dbName, String(ctx.restaurantId), String(ctx.keyId), routeId, key].join(':');
}

function collection(connection: Connection) {
  const db = connection.db;
  if (!db) {
    throw new Error('Mongo connection is not ready for idempotency records.');
  }
  return db.collection<IdempotencyRecord>(COLLECTION);
}

async function ensureIndexes(connection: Connection): Promise<void> {
  if (indexedConnections.has(connection)) return;
  const records = collection(connection);
  await Promise.all([
    records.createIndex({ scope: 1 }, { unique: true }),
    records.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  indexedConnections.add(connection);
}

function idempotencyKeyFromRequest(request: NextRequest): string | NextResponse {
  const value = request.headers.get(HEADER)?.trim();
  if (!value) {
    return apiError('invalid_request', 'Missing Idempotency-Key header.');
  }
  if (value.length > MAX_KEY_LENGTH) {
    return apiError(
      'invalid_request',
      `Idempotency-Key must be ${MAX_KEY_LENGTH} characters or fewer.`,
    );
  }
  return value;
}

function replayResponse(record: IdempotencyRecord): NextResponse {
  const response = record.response;
  if (!response) {
    return apiError('idempotency_conflict', 'Request with this Idempotency-Key is still running.');
  }

  const replayed = new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
  replayed.headers.set('Idempotency-Status', 'replayed');
  return replayed;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    isRecord(error) &&
    (error['code'] === 11000 ||
      (typeof error['message'] === 'string' && error['message'].includes('E11000')))
  );
}

async function resolveExisting(
  record: IdempotencyRecord | null,
  requestHash: string,
): Promise<NextResponse | null> {
  if (!record) return null;
  if (record.requestHash !== requestHash) {
    return apiError(
      'idempotency_conflict',
      'Idempotency key reused with a different request body.',
    );
  }
  return replayResponse(record);
}

export async function withIdempotency(input: WithIdempotencyInput): Promise<NextResponse> {
  const idempotencyKey = idempotencyKeyFromRequest(input.request);
  if (idempotencyKey instanceof NextResponse) return idempotencyKey;

  const requestHash = hashIdempotencyBody(input.body);
  const scope = createIdempotencyScope(input.ctx, input.routeId, idempotencyKey);
  await ensureIndexes(input.connection);
  const records = collection(input.connection);

  const existing = await records.findOne({ scope });
  const existingResponse = await resolveExisting(existing, requestHash);
  if (existingResponse) return existingResponse;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);

  try {
    await records.insertOne({
      scope,
      requestHash,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const raced = await records.findOne({ scope });
    const racedResponse = await resolveExisting(raced, requestHash);
    if (racedResponse) return racedResponse;
    return apiError('idempotency_conflict', 'Request with this Idempotency-Key is still running.');
  }

  try {
    const response = await input.handler();
    if (response.status >= 500) {
      await records.deleteOne({ scope });
      return response;
    }

    const body = await response.clone().text();
    await records.updateOne(
      { scope },
      {
        $set: {
          status: 'completed',
          response: {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body,
          },
          updatedAt: new Date(),
        },
      },
    );

    response.headers.set('Idempotency-Status', 'created');
    return response;
  } catch (error) {
    await records.deleteOne({ scope });
    throw error;
  }
}
