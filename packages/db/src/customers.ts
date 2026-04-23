import type { Connection, Types } from 'mongoose';
import { captureException } from '@menukaze/monitoring';
import { getModels } from './models/index';
import type { CustomerChannel } from './models/customer';

export interface CustomerUpsertInput {
  restaurantId: Types.ObjectId;
  phone: string;
  email: string;
  name?: string;
  channel: CustomerChannel;
  totalMinor: number;
  currency: string;
  occurredAt?: Date;
}

// Best-effort: errors are swallowed so order placement stays atomic even if
// the customer profile write fails.
export async function upsertCustomerFromOrder(
  connection: Connection,
  input: CustomerUpsertInput,
): Promise<void> {
  try {
    const { Customer } = getModels(connection);
    const occurredAt = input.occurredAt ?? new Date();
    const channelKey = `channelCounts.${input.channel}`;

    // Two-step upsert: Mongo rejects `$setOnInsert: { channelCounts }` in the
    // same update as `$inc: { 'channelCounts.<channel>' }` (path conflict), so
    // seed the counters-on-insert first, then increment.
    await Customer.updateOne(
      { restaurantId: input.restaurantId, phone: input.phone },
      {
        $setOnInsert: {
          restaurantId: input.restaurantId,
          phone: input.phone,
          email: input.email,
          firstChannel: input.channel,
          firstOrderAt: occurredAt,
          lifetimeOrders: 0,
          lifetimeRevenueMinor: 0,
          channelCounts: { storefront: 0, qr_dinein: 0, kiosk: 0, walk_in: 0, api: 0 },
          currency: input.currency,
          lastOrderAt: occurredAt,
        },
      },
      { upsert: true },
    ).exec();

    await Customer.updateOne(
      { restaurantId: input.restaurantId, phone: input.phone },
      {
        $set: {
          email: input.email,
          ...(input.name ? { name: input.name } : {}),
          currency: input.currency,
          lastOrderAt: occurredAt,
        },
        $inc: {
          lifetimeOrders: 1,
          lifetimeRevenueMinor: input.totalMinor,
          [channelKey]: 1,
        },
      },
    ).exec();
  } catch (error) {
    captureException(error, { surface: 'db:customers', message: 'upsert failed' });
  }
}
