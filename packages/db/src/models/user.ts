import { Schema, type Model, type Connection, type HydratedDocument } from 'mongoose';

// Not tenant-scoped: BetterAuth looks up users by email across all tenants.
// Multi-tenancy lives in the separate staff_memberships collection.

export interface UserDoc {
  email: string;
  emailLower?: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
  locale?: string;
  type?: 'staff' | 'customer';
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true },
    emailLower: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    name: { type: String, required: true },
    image: { type: String, default: null },
    locale: { type: String, default: 'en-US' },
    type: { type: String, enum: ['staff', 'customer'], default: 'staff' },
  },
  { timestamps: true, collection: 'user' },
);

userSchema.pre('save', async function () {
  if (this.isModified('email')) this.emailLower = this.email.toLowerCase();
});

export type UserHydratedDoc = HydratedDocument<UserDoc>;
export type UserModel = Model<UserDoc>;

export function userModel(connection: Connection): UserModel {
  return (
    (connection.models['User'] as UserModel | undefined) ??
    connection.model<UserDoc>('User', userSchema)
  );
}
