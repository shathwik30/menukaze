import 'server-only';
import { headers } from 'next/headers';
import type { Types } from 'mongoose';
import {
  computeAuditHash,
  getModels,
  getMongoConnection,
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

/**
 * Append a row to the per-restaurant audit log. Computes the hash chain
 * link from the most recent entry. Errors are logged but never thrown — an
 * audit miss must not break the user's primary action.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const conn = await getMongoConnection('live');
    const { AuditLog } = getModels(conn);
    const restaurantId =
      typeof input.restaurantId === 'string' ? input.restaurantId : String(input.restaurantId);
    const userId = input.userId
      ? typeof input.userId === 'string'
        ? input.userId
        : String(input.userId)
      : undefined;

    let ip: string | undefined;
    try {
      ip = ipFromHeaders(await headers()) ?? undefined;
    } catch {
      // Outside request scope — record without IP.
    }

    const previous = await AuditLog.findOne({ restaurantId }, { hash: 1 }, { sort: { at: -1 } })
      .lean()
      .exec();
    const prevHash = previous?.hash ?? ZERO_HASH;
    const at = new Date();
    const hash = computeAuditHash({
      restaurantId,
      ...(userId ? { userId } : {}),
      action: input.action,
      ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      at,
      prevHash,
    });

    const doc: Partial<AuditLogDoc> = {
      restaurantId:
        typeof input.restaurantId === 'string'
          ? (input.restaurantId as unknown as Types.ObjectId)
          : input.restaurantId,
      action: input.action,
      at,
      prevHash,
      hash,
    };
    if (input.userId) {
      doc.userId =
        typeof input.userId === 'string'
          ? (input.userId as unknown as Types.ObjectId)
          : input.userId;
    }
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
