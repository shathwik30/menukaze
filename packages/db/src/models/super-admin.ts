import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';

// Separate from User / StaffMembership so a compromised staff account
// cannot escalate to platform admin. Seed the first row manually:
//   db.super_admins.insertOne({ userId: ObjectId("..."), scopes: ["*"] })

export interface SuperAdminDoc {
  userId: Types.ObjectId;
  /** `['*']` = full access. */
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
