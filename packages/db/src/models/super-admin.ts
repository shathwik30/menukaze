import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';

/**
 * Platform super-admin. A separate collection from User and StaffMembership
 * so that a compromised staff account cannot escalate to platform admin.
 *
 * The first super-admin is seeded via manual DB insert:
 *   db.super_admins.insertOne({ userId: ObjectId("..."), scopes: ["*"] })
 */

export interface SuperAdminDoc {
  userId: Types.ObjectId;
  /** Granular scopes for future RBAC. `['*']` = full access. */
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
}

const superAdminSchema = new Schema<SuperAdminDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    scopes: { type: [String], default: ['*'] },
  },
  { timestamps: true, collection: 'super_admins' },
);

export type SuperAdminHydratedDoc = HydratedDocument<SuperAdminDoc>;
export type SuperAdminModel = Model<SuperAdminDoc>;

export function superAdminModel(connection: Connection): SuperAdminModel {
  return (
    (connection.models['SuperAdmin'] as SuperAdminModel | undefined) ??
    connection.model<SuperAdminDoc>('SuperAdmin', superAdminSchema)
  );
}
