import { Schema, type Model, type Connection, type HydratedDocument } from 'mongoose';

export interface PlanDoc {
  name: string;
  monthlyMinor: number;
  /** Basis points (250 = 2.50%). */
  commissionBps: number;
  flatFeeMinor: number;
  features: string[];
  /** null = unlimited. */
  orderLimit: number | null;
  /** 0 = no trial. */
  trialDays: number;
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
