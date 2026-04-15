import 'server-only';
import { headers } from 'next/headers';
import type { Types } from 'mongoose';
import {
  computeAuditHash,
  getModels,
  getMongoConnection,
  parseObjectId,
  ZERO_HASH,
  type AuditLogDoc,
} from '@menukaze/db';
import { captureException } from '@menukaze/monitoring';
import { ipFromHeaders } from '@menukaze/shared';

interface RecordAuditInput {
  restaurantId: Types.ObjectId | string;
  userId?: Types.ObjectId | string;
  userEmail?: string;
  role?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

function toObjectId(value: Types.ObjectId | string, label: string): Types.ObjectId {
  if (typeof value !== 'string') return value;
  const parsed = parseObjectId(value);
  if (!parsed) {
    throw new TypeError(`audit: ${label} is not a valid ObjectId string: ${value}`);
  }
  return parsed;
}

function toIdString(value: Types.ObjectId | string): string {
  return typeof value === 'string' ? value : value.toHexString();
}

/**
 * Append a row to the per-restaurant audit log. Computes the hash chain
 * link from the most recent entry. Errors are logged but never thrown — an
 * audit miss must not break the user's primary action.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const conn = await getMongoConnection('live');
    const { AuditLog } = getModels(conn);
    const restaurantObjectId = toObjectId(input.restaurantId, 'restaurantId');
    const userObjectId = input.userId ? toObjectId(input.userId, 'userId') : undefined;
    const restaurantIdStr = toIdString(restaurantObjectId);
    const userIdStr = userObjectId ? toIdString(userObjectId) : undefined;

    let ip: string | undefined;
    try {
      ip = ipFromHeaders(await headers()) ?? undefined;
    } catch {
      // Outside request scope — record without IP.
    }

    const previous = await AuditLog.findOne(
      { restaurantId: restaurantObjectId },
      { hash: 1 },
      { sort: { at: -1 } },
    )
      .lean()
      .exec();
    const prevHash = previous?.hash ?? ZERO_HASH;
    const at = new Date();
    const hash = computeAuditHash({
      restaurantId: restaurantIdStr,
      ...(userIdStr ? { userId: userIdStr } : {}),
      action: input.action,
      ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      at,
      prevHash,
    });

    const doc: Partial<AuditLogDoc> = {
      restaurantId: restaurantObjectId,
      action: input.action,
      at,
      prevHash,
      hash,
    };
    if (userObjectId) doc.userId = userObjectId;
    if (input.userEmail) doc.userEmail = input.userEmail;
    if (input.role) doc.role = input.role;
    if (ip) doc.ip = ip;
    if (input.resourceType) doc.resourceType = input.resourceType;
    if (input.resourceId) doc.resourceId = input.resourceId;
    if (input.metadata) doc.metadata = input.metadata;

    await AuditLog.create(doc);
  } catch (error) {
    captureException(error, { surface: 'dashboard:audit', message: 'failed to record entry' });
  }
}
