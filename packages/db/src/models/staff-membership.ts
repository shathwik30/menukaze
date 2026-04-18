import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';
import {
  STAFF_MEMBERSHIP_STATUSES,
  STAFF_ROLES,
  type StaffMembershipStatus,
  type StaffRole,
} from '@menukaze/shared';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

export interface StaffMembershipDoc {
  restaurantId: Types.ObjectId;
  userId: Types.ObjectId;
  role: StaffRole;
  customPermissions?: string[];
  assignedTableIds?: Types.ObjectId[];
  status: StaffMembershipStatus;
  invitedBy?: Types.ObjectId;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  createdAt: Date;
  updatedAt: Date;
}

const staffMembershipSchema = new Schema<StaffMembershipDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: STAFF_ROLES,
      required: true,
    },
    customPermissions: { type: [String], default: undefined },
    assignedTableIds: { type: [Schema.Types.ObjectId], default: undefined },
    status: { type: String, enum: STAFF_MEMBERSHIP_STATUSES, default: 'active' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastLoginAt: Date,
    lastLoginIp: String,
  },
  { timestamps: true, collection: 'staff_memberships' },
);

staffMembershipSchema.plugin(tenantScopedPlugin);

// One membership per (user, restaurant).
staffMembershipSchema.index({ restaurantId: 1, userId: 1 }, { unique: true });
staffMembershipSchema.index({ restaurantId: 1, role: 1, status: 1 });
// Login enumerates a user's memberships across tenants.
staffMembershipSchema.index({ userId: 1 });

export type StaffMembershipHydratedDoc = HydratedDocument<StaffMembershipDoc>;
export type StaffMembershipModel = Model<StaffMembershipDoc>;

export function staffMembershipModel(connection: Connection): StaffMembershipModel {
  return (
    (connection.models['StaffMembership'] as StaffMembershipModel | undefined) ??
    connection.model<StaffMembershipDoc>('StaffMembership', staffMembershipSchema)
  );
}
