import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';

/**
 * Per-restaurant subscription record. Tracks plan assignment, billing period,
 * and any per-merchant pricing overrides. Platform-level (not tenant-scoped).
 */

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';

export interface SubscriptionOverrides {
  monthlyMinor?: number;
  commissionBps?: number;
  flatFeeMinor?: number;
}

export interface SubscriptionDoc {
  restaurantId: Types.ObjectId;
  planId: Types.ObjectId;
  status: SubscriptionStatus;
  trialEndsAt?: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** Per-merchant pricing overrides. Fields present here replace the plan defaults. */
  overrides: SubscriptionOverrides;
  /** Razorpay subscription or customer reference for auto-charge. */
  paymentMethodRef?: string;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<SubscriptionDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    status: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'suspended', 'cancelled'],
      required: true,
      default: 'trialing',
    },
    trialEndsAt: Date,
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    overrides: {
      monthlyMinor: { type: Number, min: 0 },
      commissionBps: { type: Number, min: 0, max: 10000 },
      flatFeeMinor: { type: Number, min: 0 },
    },
    paymentMethodRef: String,
  },
  { timestamps: true, collection: 'subscriptions' },
);

subscriptionSchema.index({ restaurantId: 1 }, { unique: true });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

export type SubscriptionHydratedDoc = HydratedDocument<SubscriptionDoc>;
export type SubscriptionModel = Model<SubscriptionDoc>;

export function subscriptionModel(connection: Connection): SubscriptionModel {
  return (
    (connection.models['Subscription'] as SubscriptionModel | undefined) ??
    connection.model<SubscriptionDoc>('Subscription', subscriptionSchema)
  );
}
