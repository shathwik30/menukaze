import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { ORDER_CHANNELS, type OrderChannel } from '@menukaze/shared';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// Upserted by lower-cased email on every order. firstChannel is immutable
// (acquisition source for analytics); most-used channel is derived at read
// time from channelCounts.

export type CustomerChannel = OrderChannel;

export interface CustomerDoc {
  restaurantId: Types.ObjectId;
  email: string;
  name?: string;
  phone?: string;
  firstChannel: CustomerChannel;
  channelCounts: Record<CustomerChannel, number>;
  lifetimeOrders: number;
  lifetimeRevenueMinor: number;
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
