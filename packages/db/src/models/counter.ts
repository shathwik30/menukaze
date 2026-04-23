import { Schema, type Connection, type Model, type Types } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// Generic per-tenant atomic counter. Use `key` to namespace (e.g.
// `order-pickup:2026-04-23` for the daily order pickup number). Each
// (restaurantId, key) pair is isolated; incrementing one never touches
// another, so daily buckets reset cleanly without a cron job — we just
// write to a new key the next day.

export interface CounterDoc {
  restaurantId: Types.ObjectId;
  key: string;
  seq: number;
  updatedAt: Date;
  createdAt: Date;
}

const counterSchema = new Schema<CounterDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    key: { type: String, required: true, maxlength: 120 },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'counters' },
);

counterSchema.plugin(tenantScopedPlugin);
counterSchema.index({ restaurantId: 1, key: 1 }, { unique: true });

export type CounterModel = Model<CounterDoc>;

export function counterModel(connection: Connection): CounterModel {
  return (
    (connection.models['Counter'] as CounterModel | undefined) ??
    connection.model<CounterDoc>('Counter', counterSchema)
  );
}
