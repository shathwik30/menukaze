import 'server-only';
import { headers } from 'next/headers';
import type { Types } from 'mongoose';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';

interface LogPlatformActionOpts {
  targetRestaurantId?: string | Types.ObjectId;
  diff?: Record<string, unknown>;
}

/**
 * Insert a platform audit log entry. Call this inside server actions after
 * mutations to record what the super admin did.
 */
export async function logPlatformAction(
  actorUserId: string,
  action: string,
  resource: string,
  resourceId?: string,
  opts?: LogPlatformActionOpts,
): Promise<void> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
  const userAgent = h.get('user-agent') ?? '';

  const actorOid = parseObjectId(actorUserId);
  if (!actorOid) return;

  const targetRestaurantOid =
    opts?.targetRestaurantId instanceof Object
      ? (opts.targetRestaurantId as Types.ObjectId)
      : opts?.targetRestaurantId
        ? parseObjectId(opts.targetRestaurantId)
        : undefined;

  const conn = await getMongoConnection('live');
  const { PlatformAuditLog } = getModels(conn);
  await PlatformAuditLog.create({
    actorUserId: actorOid,
    action,
    resource,
    resourceId,
    targetRestaurantId: targetRestaurantOid ?? undefined,
    diff: opts?.diff,
    ip,
    userAgent,
  });
}
