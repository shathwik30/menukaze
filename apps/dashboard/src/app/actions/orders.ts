'use server';

import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels, type OrderStatus } from '@menukaze/db';
import { channels } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import { requireOnboarded } from '@/lib/session';

/**
 * Transitions the canonical status FSM for dashboard operators.
 * - `received`  starting state after checkout (before payment captured)
 * - `confirmed` payment captured — the kitchen can start
 * - `preparing` kitchen staff tapped "start"
 * - `ready`     kitchen staff tapped "ready"
 * - `served`    dine-in only, waiter tapped "served"
 * - `completed` order archived (terminal)
 * - `cancelled` terminal, can be reached from any non-terminal state
 */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  received: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'out_for_delivery', 'completed', 'cancelled'],
  served: ['completed'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

const updateInput = z.object({
  orderId: z.string().min(1),
  nextStatus: z.enum([
    'confirmed',
    'preparing',
    'ready',
    'served',
    'out_for_delivery',
    'delivered',
    'completed',
    'cancelled',
  ]),
});

export type UpdateOrderStatusResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; error: string };

export async function updateOrderStatusAction(raw: unknown): Promise<UpdateOrderStatusResult> {
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);

  if (!Types.ObjectId.isValid(parsed.data.orderId)) {
    return { ok: false, error: 'Unknown order.' };
  }
  const orderId = new Types.ObjectId(parsed.data.orderId);

  const conn = await getMongoConnection('live');
  const { Order } = getModels(conn);

  const order = await Order.findOne({ restaurantId, _id: orderId }).exec();
  if (!order) return { ok: false, error: 'Order not found.' };

  const allowed = NEXT_STATUSES[order.status];
  if (!allowed.includes(parsed.data.nextStatus)) {
    return {
      ok: false,
      error: `Cannot transition from ${order.status} to ${parsed.data.nextStatus}.`,
    };
  }

  const now = new Date();
  const isTerminal =
    parsed.data.nextStatus === 'completed' || parsed.data.nextStatus === 'cancelled';

  await Order.updateOne(
    { restaurantId, _id: orderId },
    {
      $set: {
        status: parsed.data.nextStatus,
        ...(isTerminal ? { completedAt: now } : {}),
      },
      $push: {
        statusHistory: {
          status: parsed.data.nextStatus,
          at: now,
          byUserId: new Types.ObjectId(session.user.id),
        },
      },
    },
  ).exec();

  // Realtime fan-out: customer tracking page + dashboard orders feed.
  const restaurantIdStr = String(restaurantId);
  const orderIdStr = String(orderId);
  try {
    await Promise.all([
      publishRealtimeEvent(channels.customerOrder(restaurantIdStr, orderIdStr), {
        type: 'order.status_changed',
        orderId: orderIdStr,
        status: parsed.data.nextStatus,
        changedAt: now.toISOString(),
      }),
      publishRealtimeEvent(channels.orders(restaurantIdStr), {
        type: 'order.status_changed',
        orderId: orderIdStr,
        status: parsed.data.nextStatus,
        changedAt: now.toISOString(),
      }),
    ]);
  } catch (error) {
    console.warn('[orders] ably publish failed', error);
  }

  return { ok: true, status: parsed.data.nextStatus };
}
