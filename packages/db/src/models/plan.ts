import { Schema, type Model, type Connection, type HydratedDocument } from 'mongoose';

/**
 * Billing plan tier. Defines pricing and feature entitlements for merchants.
 * Plans are platform-level (not tenant-scoped).
 */

export interface PlanDoc {
  name: string;
  /** Monthly subscription fee in minor currency units (cents/paise). */
  monthlyMinor: number;
  /** Commission rate in basis points (250 = 2.5%). */
  commissionBps: number;
  /** Flat fee per order in minor currency units. */
  flatFeeMinor: number;
  /** Feature keys enabled by this plan (e.g. ['kiosk', 'multi_language']). */
  features: string[];
  /** Max orders per month. Null = unlimited. */
  orderLimit: number | null;
  /** Free trial duration in days. 0 = no trial. */
  trialDays: number;
  /** Whether this plan is available for new assignments. */
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const planSchema = new Schema<PlanDoc>(
  {
    name: { type: String, required: true, maxlength: 120 },
    monthlyMinor: { type: Number, required: true, min: 0 },
    commissionBps: { type: Number, required: true, min: 0, max: 10000 },
    flatFeeMinor: { type: Number, required: true, min: 0, default: 0 },
    features: { type: [String], default: [] },
    orderLimit: { type: Number, default: null, min: 0 },
    trialDays: { type: Number, default: 14, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'plans' },
);

planSchema.index({ active: 1, monthlyMinor: 1 });

export type PlanHydratedDoc = HydratedDocument<PlanDoc>;
export type PlanModel = Model<PlanDoc>;

export function planModel(connection: Connection): PlanModel {
  return (
    (connection.models['Plan'] as PlanModel | undefined) ??
    connection.model<PlanDoc>('Plan', planSchema)
  );
}
