import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * Tenant-scoped: a (user × restaurant) pairing carrying the user's role and
 * any custom permission flags. The same user can have memberships at multiple
 * restaurants with different roles.
 */
export interface StaffMembershipDoc {
  restaurantId: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'owner' | 'manager' | 'waiter' | 'kitchen' | 'cashier' | 'custom';
  customPermissions?: string[];
  assignedTableIds?: Types.ObjectId[];
  status: 'active' | 'deactivated';
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
      enum: ['owner', 'manager', 'waiter', 'kitchen', 'cashier', 'custom'],
      required: true,
    },
    customPermissions: { type: [String], default: undefined },
    assignedTableIds: { type: [Schema.Types.ObjectId], default: undefined },
    status: { type: String, enum: ['active', 'deactivated'], default: 'active' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastLoginAt: Date,
    lastLoginIp: String,
  },
  { timestamps: true, collection: 'staff_memberships' },
);

staffMembershipSchema.plugin(tenantScopedPlugin);

// A user can only have one membership per restaurant.
staffMembershipSchema.index({ restaurantId: 1, userId: 1 }, { unique: true });
staffMembershipSchema.index({ restaurantId: 1, role: 1, status: 1 });
// Used by login flow to enumerate a user's memberships across tenants.
staffMembershipSchema.index({ userId: 1 });

export type StaffMembershipHydratedDoc = HydratedDocument<StaffMembershipDoc>;
export type StaffMembershipModel = Model<StaffMembershipDoc>;

export function staffMembershipModel(connection: Connection): StaffMembershipModel {
  return (
    (connection.models['StaffMembership'] as StaffMembershipModel | undefined) ??
    connection.model<StaffMembershipDoc>('StaffMembership', staffMembershipSchema)
  );
}
