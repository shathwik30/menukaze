import { randomBytes } from 'node:crypto';
import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { STAFF_ROLES, type StaffRole } from '@menukaze/shared';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// Tokens are single-use (`usedAt` stamped on accept). Expired / revoked rows
// are retained so the dashboard can show history.

export type { StaffRole };

export interface StaffInviteDoc {
  restaurantId: Types.ObjectId;
  email: string;
  role: StaffRole;
  customPermissions?: string[];
  token: string;
  invitedByUserId: Types.ObjectId;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const staffInviteSchema = new Schema<StaffInviteDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    email: { type: String, required: true, maxlength: 320 },
    role: {
      type: String,
      enum: STAFF_ROLES,
      required: true,
    },
    customPermissions: { type: [String], default: undefined },
    token: { type: String, required: true, unique: true },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    revokedAt: Date,
  },
  { timestamps: true, collection: 'staff_invites' },
);

staffInviteSchema.plugin(tenantScopedPlugin);
staffInviteSchema.index({ restaurantId: 1, email: 1 });
staffInviteSchema.index({ restaurantId: 1, usedAt: 1, revokedAt: 1 });
staffInviteSchema.index({ restaurantId: 1, usedAt: 1, revokedAt: 1, createdAt: -1 });
staffInviteSchema.index({ expiresAt: 1 });

staffInviteSchema.pre('validate', function () {
  this.email = this.email.toLowerCase();
});

// 32 random bytes → ~256 bits of entropy. Brute-forcing a single invite is infeasible.
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export type StaffInviteHydratedDoc = HydratedDocument<StaffInviteDoc>;
export type StaffInviteModel = Model<StaffInviteDoc>;

export function staffInviteModel(connection: Connection): StaffInviteModel {
  return (
    (connection.models['StaffInvite'] as StaffInviteModel | undefined) ??
    connection.model<StaffInviteDoc>('StaffInvite', staffInviteSchema)
  );
}
