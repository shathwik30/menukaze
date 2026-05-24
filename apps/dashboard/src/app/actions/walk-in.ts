'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  buildMenuCommercePricing,
  enqueueWebhookEvent,
  generatePublicOrderId,
  getModels,
  getMongoConnection,
  reserveDailyPickupNumber,
  restaurantHasReachedOrderCapacity,
  upsertCustomerFromOrder,
} from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { captureException } from '@menukaze/monitoring';
import { channels } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import { formatMoney, orderWebhookChannel, parseCurrencyCode } from '@menukaze/shared';
import { runRestaurantAction, validationError, type ActionResult } from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const PERMISSION_ERROR = 'You do not have permission to create walk-in orders.';

const modifierInput = z.object({
  groupName: z.string().min(1),
  optionName: z.string().min(1),
  priceMinor: z.number().int().min(0),
});

const lineInput = z.object({
  itemId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).max(99),
  modifiers: z.array(modifierInput).max(20).default([]),
  notes: z.string().max(500).optional(),
});

const walkInInput = z.object({
  customerName: z.string().trim().max(200).optional(),
  customerPhone: z.string().min(7).max(40).optional(),
  customerEmail: z.string().email().max(320).optional(),
  type: z.enum(['dine_in', 'pickup']),
  tableId: z.string().min(1).optional(),
  paymentMethod: z.enum(['cash', 'pay_later']),
  lines: z.array(lineInput).min(1).max(50),
});

export interface CreateWalkInResult {
  orderId: string;
  publicOrderId: string;
}

// cash → payment succeeded immediately; pay_later → payment stays pending so the
// dine-in tab settles later, but status goes to `confirmed` so the kitchen starts.
export async function createWalkInOrderAction(
  raw: unknown,
): Promise<ActionResult<CreateWalkInResult>> {
  const parsed = walkInInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;

  if (input.type === 'dine_in' && !input.tableId) {
    return { ok: false, error: 'Pick a table for dine-in orders.' };
  }
  if (input.type === 'pickup' && input.tableId) {
    return { ok: false, error: 'Takeaway orders should not have a table.' };
  }

  return runRestaurantAction(
    ['orders.create_walkin'],
    { onError: 'Failed to create walk-in order.', onForbidden: PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const tableObjectId = input.tableId ? parseObjectId(input.tableId) : null;
      if (input.tableId && !tableObjectId) throw new Error('Unknown table.');

      const conn = await getMongoConnection('live');
      const { Restaurant, Order, Table } = getModels(conn);

      const restaurant = await Restaurant.findById(restaurantId).exec();
      if (!restaurant) throw new Error('Restaurant not found.');

      if (restaurant.holidayMode?.enabled) {
        throw new Error(
          restaurant.holidayMode.message ?? 'Holiday mode is on — orders are paused.',
        );
      }
      if (restaurant.throttling?.enabled) {
        const atCapacity = await restaurantHasReachedOrderCapacity(
          conn,
          restaurantId,
          restaurant.throttling.maxConcurrentOrders,
        );
        if (atCapacity) {
          throw new Error('Kitchen is at capacity. Mark some orders ready first.');
        }
      }

      let table: Awaited<ReturnType<typeof Table.findOne>> = null;
      if (tableObjectId) {
        table = await Table.findOne({ restaurantId, _id: tableObjectId }).exec();
        if (!table) throw new Error('Table not found.');
      }

      const currency = parseCurrencyCode(restaurant.currency);
      const locale = restaurant.locale;
      const pricing = await buildMenuCommercePricing({
        connection: conn,
        restaurantId,
        restaurant,
        lines: input.lines,
        channel: 'walk_in',
      });
      if ('error' in pricing) throw new Error(pricing.error);

      const minimumOrderMinor = restaurant.minimumOrderMinor ?? 0;
      if (minimumOrderMinor > 0 && pricing.subtotalMinor < minimumOrderMinor) {
        throw new Error(`Minimum order is ${formatMoney(minimumOrderMinor, currency, locale)}.`);
      }

      const { surchargeMinor, taxMinor } = pricing;
      const totalMinor = pricing.subtotalMinor + surchargeMinor;
      if (totalMinor <= 0) throw new Error('Cart is empty.');

      const publicOrderId = generatePublicOrderId();
      const pickupNumber = await reserveDailyPickupNumber(conn, restaurantId, restaurant.timezone);
      const now = new Date();
      const trimmedName = input.customerName?.trim();
      const customerName = trimmedName && trimmedName.length > 0 ? trimmedName : 'Walk-in customer';
      const customerPhone = input.customerPhone?.trim();
      const customerEmail = input.customerEmail?.trim();
      const prepMinutes = pricing.prepMinutes;
      const estimatedReadyAt = new Date(now.getTime() + prepMinutes * 60_000);

      const paymentSucceeded = input.paymentMethod === 'cash';
      const order = await Order.create({
        restaurantId,
        publicOrderId,
        pickupNumber,
        channel: 'walk_in',
        type: input.type,
        customer: {
          name: customerName,
          ...(customerPhone ? { phone: customerPhone } : {}),
          ...(customerEmail
            ? { email: customerEmail }
            : { email: `walkin+${publicOrderId}@noreply.local` }),
        },
        items: pricing.snapshotLines,
        subtotalMinor: pricing.subtotalMinor,
        taxMinor,
        tipMinor: 0,
        totalMinor,
        currency: restaurant.currency,
        status: 'confirmed',
        statusHistory: [
          { status: 'received', at: now },
          { status: 'confirmed', at: now },
        ],
        estimatedReadyAt,
        ...(table ? { tableId: table._id } : {}),
        payment: {
          gateway: 'cash',
          status: paymentSucceeded ? 'succeeded' : 'pending',
          amountMinor: totalMinor,
          currency: restaurant.currency,
          methodLabel: input.paymentMethod === 'cash' ? 'Cash' : 'Pay later',
          ...(paymentSucceeded ? { paidAt: now } : {}),
        },
      });

      if (table && input.type === 'dine_in') {
        await Table.updateOne(
          { restaurantId, _id: table._id },
          { $set: { status: 'occupied' } },
        ).exec();
      }

      if (customerPhone && customerEmail) {
        await upsertCustomerFromOrder(conn, {
          restaurantId,
          phone: customerPhone,
          email: customerEmail,
          name: customerName !== 'Walk-in customer' ? customerName : undefined,
          channel: 'walk_in',
          totalMinor,
          currency: restaurant.currency,
        });
      }

      try {
        await publishRealtimeEvent(channels.orders(String(restaurantId)), {
          type: 'order.created',
          orderId: String(order._id),
          channelId: 'walk_in',
          totalMinor,
          currency: restaurant.currency,
          createdAt: now.toISOString(),
        });
      } catch (err) {
        captureException(err, { surface: 'dashboard:walk-in', message: 'ably publish failed' });
      }

      await enqueueWebhookEvent(conn, {
        restaurantId,
        eventType: 'order.created',
        data: {
          id: String(order._id),
          public_order_id: publicOrderId,
          channel: orderWebhookChannel('walk_in'),
          type: input.type,
          total_minor: totalMinor,
          currency: restaurant.currency,
          status: 'confirmed',
        },
      });

      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'order.walk_in.created',
        resourceType: 'order',
        resourceId: String(order._id),
        metadata: {
          publicOrderId,
          type: input.type,
          paymentMethod: input.paymentMethod,
          totalMinor,
          itemCount: pricing.snapshotLines.length,
        },
      });

      revalidatePath('/admin/orders');
      revalidatePath('/admin/kds');

      return {
        ok: true,
        data: { orderId: String(order._id), publicOrderId },
      };
    },
  );
}
