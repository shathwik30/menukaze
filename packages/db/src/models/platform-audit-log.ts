import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';

/**
 * Audit trail for every super-admin action. Immutable — entries are never
 * updated or deleted. Not tenant-scoped.
 */

export interface PlatformAuditLogDoc {
  actorUserId: Types.ObjectId;
  /** Action verb, e.g. 'merchant.suspend', 'plan.create', 'flag.toggle'. */
  action: string;
  /** Resource type, e.g. 'restaurant', 'plan', 'feature_flag'. */
  resource: string;
  /** Resource ID (stringified ObjectId or key). */
  resourceId?: string;
  /** Set when the action targets a specific merchant. */
  targetRestaurantId?: Types.ObjectId;
  /** Before/after snapshot for mutations. */
  diff?: Record<string, unknown>;
  ip: string;
  userAgent: string;
  createdAt: Date;
}

const platformAuditLogSchema = new Schema<PlatformAuditLogDoc>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, maxlength: 200 },
    resource: { type: String, required: true, maxlength: 100 },
    resourceId: { type: String, maxlength: 200 },
    targetRestaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant' },
    diff: { type: Schema.Types.Mixed },
    ip: { type: String, required: true },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'platform_audit_logs' },
);

platformAuditLogSchema.index({ createdAt: -1 });
platformAuditLogSchema.index({ action: 1, createdAt: -1 });
platformAuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
platformAuditLogSchema.index({ targetRestaurantId: 1, createdAt: -1 });

export type PlatformAuditLogHydratedDoc = HydratedDocument<PlatformAuditLogDoc>;
export type PlatformAuditLogModel = Model<PlatformAuditLogDoc>;

export function platformAuditLogModel(connection: Connection): PlatformAuditLogModel {
  return (
    (connection.models['PlatformAuditLog'] as PlatformAuditLogModel | undefined) ??
    connection.model<PlatformAuditLogDoc>('PlatformAuditLog', platformAuditLogSchema)
  );
}
