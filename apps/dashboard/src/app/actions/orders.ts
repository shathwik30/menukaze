'use server';

import { z } from 'zod';
import { getMongoConnection, getModels, type OrderStatus } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { channels } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import { sendTransactionalEmail } from '@menukaze/shared/transactional-email';
import {
  actionError,
  invalidEntityError,
  validationError,
  withRestaurantAnyFlagAction,
} from '@/lib/action-helpers';
import { OrderReadyEmail } from '@/emails/order-ready';

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
  cancelReason: z.string().min(1).max(500).optional(),
});

export type UpdateOrderStatusResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; error: string };

export async function updateOrderStatusAction(raw: unknown): Promise<UpdateOrderStatusResult> {
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  // Cancel is a distinct permission (spec §5 — cashier / manager / owner can
  // cancel) from ordinary status advancement (kitchen + waiter). We require
  // a reason on cancel below, but the rbac gate happens first.
  const requiredFlag =
    parsed.data.nextStatus === 'cancelled' ? 'orders.cancel' : 'orders.update_status';
  const orderId = parseObjectId(parsed.data.orderId);
  if (!orderId) return invalidEntityError('order');

  try {
    return await withRestaurantAnyFlagAction([requiredFlag], async ({ restaurantId, session }) => {
      const actorUserId = parseObjectId(session.user.id);
      if (!actorUserId) {
        throw new Error('Unknown user.');
      }

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
      const isCancel = parsed.data.nextStatus === 'cancelled';

      // Require a reason on cancel so the audit trail explains the revert.
      if (isCancel && !parsed.data.cancelReason) {
        return { ok: false, error: 'Please provide a reason for cancelling.' };
      }

      await Order.updateOne(
        { restaurantId, _id: orderId },
        {
          $set: {
            status: parsed.data.nextStatus,
            ...(isTerminal ? { completedAt: now } : {}),
            ...(isCancel && parsed.data.cancelReason
              ? { cancelReason: parsed.data.cancelReason }
              : {}),
          },
          $push: {
            statusHistory: {
              status: parsed.data.nextStatus,
              at: now,
              byUserId: actorUserId,
            },
          },
        },
      ).exec();

      const restaurantIdStr = String(restaurantId);
      const orderIdStr = String(orderId);
      const statusChangedEvent = {
        type: 'order.status_changed',
        orderId: orderIdStr,
        status: parsed.data.nextStatus,
        changedAt: now.toISOString(),
      } as const;
      try {
        const realtimePublishes = [
          publishRealtimeEvent(
            channels.customerOrder(restaurantIdStr, orderIdStr),
            statusChangedEvent,
          ),
          publishRealtimeEvent(channels.orders(restaurantIdStr), statusChangedEvent),
        ];
        if (order.sessionId) {
          realtimePublishes.push(
            publishRealtimeEvent(
              channels.customerSession(restaurantIdStr, String(order.sessionId)),
              statusChangedEvent,
            ),
          );
        }
        await Promise.all(realtimePublishes);
      } catch (error) {
        console.warn('[orders] ably publish failed', error);
      }

      // Spec §13: customers receive an email when an order transitions to
      // ready / out_for_delivery. Best-effort — a Resend outage must not
      // reject the status update.
      if (parsed.data.nextStatus === 'ready' || parsed.data.nextStatus === 'out_for_delivery') {
        try {
          const { Restaurant } = getModels(conn);
          const restaurant = await Restaurant.findById(restaurantId).exec();
          const baseHost =
            process.env['NEXT_PUBLIC_STOREFRONT_HOST'] ??
            (restaurant ? `${restaurant.slug}.menukaze.dev` : '');
          const scheme = baseHost.includes('localhost') ? 'http' : 'https';
          const trackingUrl = baseHost ? `${scheme}://${baseHost}/order/${orderIdStr}` : undefined;

          await sendTransactionalEmail({
            to: order.customer.email,
            subject: `Your order is ready · ${restaurant?.name ?? 'your order'}`,
            react: OrderReadyEmail({
              restaurantName: restaurant?.name ?? 'Menukaze',
              customerName: order.customer.name,
              publicOrderId: order.publicOrderId,
              orderType: order.type,
              ...(trackingUrl ? { trackingUrl } : {}),
            }),
          });
        } catch (error) {
          console.warn('[orders] order-ready email failed', error);
        }
      }

      return { ok: true, status: parsed.data.nextStatus };
    });
  } catch (error) {
    return actionError(
      error,
      'Failed to update order.',
      'You do not have permission to update this order.',
    );
  }
}
