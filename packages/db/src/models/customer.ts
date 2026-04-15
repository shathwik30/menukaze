import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { ORDER_CHANNELS, type OrderChannel } from '@menukaze/shared';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * Per-restaurant customer profile. Built up incrementally from every order:
 * we upsert by lower-cased email (the most reliable identifier today),
 * accumulating channel counts, lifetime order count, and revenue.
 *
 * "First channel" is stamped at create time and never changes — it is the
 * acquisition source for analytics. "Most-used channel" is derived at read
 * time from the per-channel counts.
 *
 * Phone matching is reserved for a later iteration (Step 51 turns on
 * phone-based identity once SMS is live).
 */

export type CustomerChannel = OrderChannel;

export interface CustomerDoc {
  restaurantId: Types.ObjectId;
  /** Lower-cased canonical contact email. */
  email: string;
  /** Last seen display name from any order. */
  name?: string;
  /** Last seen phone, if a channel collected one. */
  phone?: string;
  firstChannel: CustomerChannel;
  channelCounts: Record<CustomerChannel, number>;
  lifetimeOrders: number;
  lifetimeRevenueMinor: number;
  /** Snapshot of the most recent order's currency for display. */
  currency: string;
  firstOrderAt: Date;
  lastOrderAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<CustomerDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    email: { type: String, required: true, maxlength: 320 },
    name: { type: String, maxlength: 200 },
    phone: { type: String, maxlength: 40 },
    firstChannel: {
      type: String,
      enum: ORDER_CHANNELS,
      required: true,
    },
    channelCounts: {
      type: {
        storefront: { type: Number, default: 0, min: 0 },
        qr_dinein: { type: Number, default: 0, min: 0 },
        kiosk: { type: Number, default: 0, min: 0 },
        walk_in: { type: Number, default: 0, min: 0 },
        api: { type: Number, default: 0, min: 0 },
      },
      default: () => ({ storefront: 0, qr_dinein: 0, kiosk: 0, walk_in: 0, api: 0 }),
    },
    lifetimeOrders: { type: Number, default: 0, min: 0 },
    lifetimeRevenueMinor: { type: Number, default: 0, min: 0 },
    currency: { type: String, required: true, minlength: 3, maxlength: 3 },
    firstOrderAt: { type: Date, required: true },
    lastOrderAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'customers' },
);

customerSchema.plugin(tenantScopedPlugin);
customerSchema.index({ restaurantId: 1, email: 1 }, { unique: true });
customerSchema.index({ restaurantId: 1, lastOrderAt: -1 });
customerSchema.index({ restaurantId: 1, lifetimeOrders: -1 });

customerSchema.pre('validate', function () {
  this.email = this.email.toLowerCase();
});

export type CustomerHydratedDoc = HydratedDocument<CustomerDoc>;
export type CustomerModel = Model<CustomerDoc>;

export function customerModel(connection: Connection): CustomerModel {
  return (
    (connection.models['Customer'] as CustomerModel | undefined) ??
    connection.model<CustomerDoc>('Customer', customerSchema)
  );
}
