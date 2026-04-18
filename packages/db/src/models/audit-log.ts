import { createHash } from 'node:crypto';
import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// Hash chain: each row stores prevHash (the previous row's `hash` for the
// same restaurant) and hash = SHA-256 of the canonical blob including
// prevHash. Tampering or removal breaks the chain. Chain scope is per
// restaurant so tenants' chains don't tangle.

export interface AuditLogDoc {
  restaurantId: Types.ObjectId;
  userId?: Types.ObjectId;
  userEmail?: string;
  role?: string;
  ip?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  at: Date;
  prevHash: string;
  hash: string;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userEmail: { type: String, maxlength: 320 },
    role: { type: String, maxlength: 32 },
    ip: { type: String, maxlength: 64 },
    action: { type: String, required: true, maxlength: 80 },
    resourceType: { type: String, maxlength: 80 },
    resourceId: { type: String, maxlength: 80 },
    metadata: { type: Schema.Types.Mixed },
    at: { type: Date, required: true, default: () => new Date() },
    prevHash: { type: String, required: true, maxlength: 64 },
    hash: { type: String, required: true, maxlength: 64 },
  },
  { timestamps: true, collection: 'audit_logs' },
);

auditLogSchema.plugin(tenantScopedPlugin);
auditLogSchema.index({ restaurantId: 1, at: -1 });
auditLogSchema.index({ restaurantId: 1, userId: 1, at: -1 });
auditLogSchema.index({ restaurantId: 1, action: 1, at: -1 });

export const ZERO_HASH = '0'.repeat(64);

export function computeAuditHash(input: {
  restaurantId: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  at: Date;
  prevHash: string;
}): string {
  const blob = JSON.stringify({
    r: input.restaurantId,
    u: input.userId ?? null,
    a: input.action,
    rt: input.resourceType ?? null,
    rid: input.resourceId ?? null,
    m: input.metadata ?? null,
    t: input.at.toISOString(),
    p: input.prevHash,
  });
  return createHash('sha256').update(blob).digest('hex');
}

export type AuditLogHydratedDoc = HydratedDocument<AuditLogDoc>;
export type AuditLogModel = Model<AuditLogDoc>;

export function auditLogModel(connection: Connection): AuditLogModel {
  return (
    (connection.models['AuditLog'] as AuditLogModel | undefined) ??
    connection.model<AuditLogDoc>('AuditLog', auditLogSchema)
  );
}
