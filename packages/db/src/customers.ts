import type { Connection, Types } from 'mongoose';
import { getModels } from './models/index';
import type { CustomerChannel } from './models/customer';

export interface CustomerUpsertInput {
  restaurantId: Types.ObjectId;
  email: string;
  name?: string;
  phone?: string;
  channel: CustomerChannel;
  totalMinor: number;
  currency: string;
  occurredAt?: Date;
}

/**
 * Upsert a customer profile from a freshly-placed order. Increments the
 * channel-specific counter, lifetime totals, and lastOrderAt; sets
 * firstChannel and firstOrderAt only on first insertion.
 *
 * Best-effort: errors are swallowed to keep order placement atomic. Callers
 * can pass a closed connection from inside the same Mongo client they use
 * for the order write.
 */
export async function upsertCustomerFromOrder(
  connection: Connection,
  input: CustomerUpsertInput,
): Promise<void> {
  try {
    const { Customer } = getModels(connection);
    const occurredAt = input.occurredAt ?? new Date();
    const email = input.email.toLowerCase();
    const channelKey = `channelCounts.${input.channel}`;

    await Customer.updateOne(
      { restaurantId: input.restaurantId, email },
      {
        $set: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
          currency: input.currency,
          lastOrderAt: occurredAt,
        },
        $setOnInsert: {
          restaurantId: input.restaurantId,
          email,
          firstChannel: input.channel,
          firstOrderAt: occurredAt,
          channelCounts: {
            storefront: 0,
            qr_dinein: 0,
            kiosk: 0,
            walk_in: 0,
            api: 0,
          },
        },
        $inc: {
          lifetimeOrders: 1,
          lifetimeRevenueMinor: input.totalMinor,
          [channelKey]: 1,
        },
      },
      { upsert: true },
    ).exec();
  } catch (error) {
    console.warn('[customers] upsert failed', error);
  }
}
