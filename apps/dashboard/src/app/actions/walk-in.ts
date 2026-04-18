'use server';

import { revalidatePath } from 'next/cache';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  enqueueWebhookEvent,
  generatePublicOrderId,
  getModels,
  getMongoConnection,
  restaurantHasReachedOrderCapacity,
} from '@menukaze/db';
import { parseObjectId, parseObjectIds } from '@menukaze/db/object-id';
import { captureException } from '@menukaze/monitoring';
import { channels } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import {
  computeTax,
  DEFAULT_PREP_MINUTES,
  formatMoney,
  orderWebhookChannel,
  parseCurrencyCode,
  resolvePrimaryStationId,
  validateModifierSelection,
  walkInPlaceholderEmail,
} from '@menukaze/shared';
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
  quantity: z.number().int().min(1).max(99),
  modifiers: z.array(modifierInput).max(20).default([]),
  notes: z.string().max(500).optional(),
});

const walkInInput = z.object({
  customerName: z.string().trim().max(200).optional(),
  type: z.enum(['dine_in', 'pickup']),
  tableId: z.string().min(1).optional(),
  paymentMethod: z.enum(['cash', 'pay_later']),
  lines: z.array(lineInput).min(1).max(50),
});

export interface CreateWalkInResult {
  orderId: string;
  publicOrderId: string;
}

interface SnapshotLine {
  itemId: Types.ObjectId;
  name: string;
  priceMinor: number;
  quantity: number;
  modifiers: { groupName: string; optionName: string; priceMinor: number }[];
  notes?: string;
  lineTotalMinor: number;
  stationId?: Types.ObjectId;
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
      const itemIds = parseObjectIds(input.lines.map((l) => l.itemId));
      if (!itemIds) throw new Error('Unknown item.');

      const tableObjectId = input.tableId ? parseObjectId(input.tableId) : null;
      if (input.tableId && !tableObjectId) throw new Error('Unknown table.');

      const conn = await getMongoConnection('live');
      const { Restaurant, Item, Order, Table, Category } = getModels(conn);

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

      const items = await Item.find({ restaurantId, _id: { $in: itemIds } }).exec();
      const itemsById = new Map(items.map((item) => [String(item._id), item]));
      const categoryIds = Array.from(new Set(items.map((item) => String(item.categoryId))));
      const categories =
        categoryIds.length > 0
          ? await Category.find({ restaurantId, _id: { $in: categoryIds } }, { stationIds: 1 })
              .lean()
              .exec()
          : [];
      const categoryStationsById = new Map(
        categories.map((c) => [String(c._id), c.stationIds ?? []]),
      );

      const currency = parseCurrencyCode(restaurant.currency);
      const locale = restaurant.locale;

      const snapshotLines: SnapshotLine[] = [];
      let subtotalMinor = 0;

      for (const line of input.lines) {
        const item = itemsById.get(line.itemId);
        if (!item) throw new Error('Item no longer available.');
        if (item.soldOut) throw new Error(`${item.name} is sold out.`);
        if (item.currency !== restaurant.currency) {
          throw new Error(`Currency mismatch for ${item.name}.`);
        }

        const modResult = validateModifierSelection(item.modifiers, line.modifiers, item.name);
        if (!modResult.ok) throw new Error(modResult.error);

        const unitMinor =
          item.priceMinor + modResult.modifiers.reduce((s, m) => s + m.priceMinor, 0);
        const lineTotalMinor = unitMinor * line.quantity;
        subtotalMinor += lineTotalMinor;

        const stationId = resolvePrimaryStationId(
          item.stationIds ?? null,
          categoryStationsById.get(String(item.categoryId)) ?? null,
        );

        snapshotLines.push({
          itemId: item._id,
          name: item.name,
          priceMinor: item.priceMinor,
          quantity: line.quantity,
          modifiers: modResult.modifiers,
          ...(line.notes ? { notes: line.notes } : {}),
          lineTotalMinor,
          ...(stationId ? { stationId } : {}),
        });
      }

      if (subtotalMinor <= 0) throw new Error('Cart is empty.');

      const minimumOrderMinor = restaurant.minimumOrderMinor ?? 0;
      if (minimumOrderMinor > 0 && subtotalMinor < minimumOrderMinor) {
        throw new Error(`Minimum order is ${formatMoney(minimumOrderMinor, currency, locale)}.`);
      }

      const { surchargeMinor, taxMinor } = computeTax(subtotalMinor, restaurant.taxRules ?? []);
      const totalMinor = subtotalMinor + surchargeMinor;
      if (totalMinor <= 0) throw new Error('Cart is empty.');

      const publicOrderId = generatePublicOrderId();
      const now = new Date();
      const trimmedName = input.customerName?.trim();
      const customerName = trimmedName && trimmedName.length > 0 ? trimmedName : 'Walk-in customer';
      const prepMinutes = restaurant.estimatedPrepMinutes ?? DEFAULT_PREP_MINUTES;
      const estimatedReadyAt = new Date(now.getTime() + prepMinutes * 60_000);

      const paymentSucceeded = input.paymentMethod === 'cash';
      const order = await Order.create({
        restaurantId,
        publicOrderId,
        channel: 'walk_in',
        type: input.type,
        customer: {
          name: customerName,
          email: walkInPlaceholderEmail(publicOrderId),
        },
        items: snapshotLines,
        subtotalMinor,
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
          itemCount: snapshotLines.length,
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
