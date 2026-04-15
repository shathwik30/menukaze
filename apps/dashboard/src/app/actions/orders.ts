'use server';

import type { Types } from 'mongoose';
import { z } from 'zod';
import { enqueueWebhookEvent, getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { captureException } from '@menukaze/monitoring';
import { channels } from '@menukaze/realtime';
import { env } from '@/env';
import { recordAudit } from '@/lib/audit';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import { sendTransactionalEmail } from '@menukaze/shared/transactional-email';
import {
  canTransitionOrderStatus,
  isTerminalOrderStatus,
  orderWebhookChannel,
  webhookEventForOrderStatus,
  type OrderStatus,
  type OrderType,
} from '@menukaze/shared';
import {
  actionError,
  invalidEntityError,
  validationError,
  withRestaurantAnyFlagAction,
} from '@/lib/action-helpers';
import { OrderReadyEmail } from '@/emails/order-ready';

/**
 * Operator-facing status set. The list is the canonical FSM from
 * `@menukaze/shared` minus `received`, since `received` is only ever the
 * initial state — operators never transition INTO it.
 */
const OPERATOR_NEXT_STATUSES = [
  'confirmed',
  'preparing',
  'ready',
  'served',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
] as const satisfies readonly OrderStatus[];

const updateInput = z.object({
  orderId: z.string().min(1),
  nextStatus: z.enum(OPERATOR_NEXT_STATUSES),
  cancelReason: z.string().min(1).max(500).optional(),
});

interface OrderStatusEmailTarget {
  customer: { email: string; name: string };
  publicOrderId: string;
  type: OrderType;
}

export type UpdateOrderStatusResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; error: string };

function formatOptionalObjectId(value: Types.ObjectId | string): string {
  return typeof value === 'string' ? value : value.toHexString();
}

async function publishOrderStatusUpdate({
  restaurantId,
  orderId,
  sessionId,
  status,
  changedAt,
}: {
  restaurantId: string;
  orderId: string;
  sessionId?: Types.ObjectId | string;
  status: OrderStatus;
  changedAt: Date;
}): Promise<void> {
  const statusChangedEvent = {
    type: 'order.status_changed',
    orderId,
    status,
    changedAt: changedAt.toISOString(),
  } as const;

  try {
    const realtimePublishes = [
      publishRealtimeEvent(channels.customerOrder(restaurantId, orderId), statusChangedEvent),
      publishRealtimeEvent(channels.orders(restaurantId), statusChangedEvent),
    ];
    if (sessionId) {
      realtimePublishes.push(
        publishRealtimeEvent(
          channels.customerSession(restaurantId, formatOptionalObjectId(sessionId)),
          {
            ...statusChangedEvent,
          },
        ),
      );
    }
    await Promise.all(realtimePublishes);
  } catch (error) {
    captureException(error, { surface: 'dashboard:orders', message: 'ably publish failed' });
  }
}

function shouldSendCustomerStatusEmail(status: OrderStatus): boolean {
  return status === 'ready' || status === 'out_for_delivery';
}

function buildOrderStatusEmailSubject(status: OrderStatus, restaurantName: string): string {
  const statusLabel = status === 'out_for_delivery' ? 'out for delivery' : 'ready';
  return `Your order is ${statusLabel} · ${restaurantName}`;
}

async function sendCustomerStatusEmail({
  conn,
  restaurantId,
  orderId,
  order,
  status,
}: {
  conn: Awaited<ReturnType<typeof getMongoConnection>>;
  restaurantId: Types.ObjectId;
  orderId: string;
  order: OrderStatusEmailTarget;
  status: OrderStatus;
}): Promise<void> {
  if (!shouldSendCustomerStatusEmail(status)) return;

  try {
    const { Restaurant } = getModels(conn);
    const restaurant = await Restaurant.findById(restaurantId).exec();
    const restaurantName = restaurant?.name ?? 'your order';
    const baseHost =
      env.NEXT_PUBLIC_STOREFRONT_HOST ?? (restaurant ? `${restaurant.slug}.menukaze.dev` : '');
    const scheme = baseHost.includes('localhost') ? 'http' : 'https';
    const trackingUrl = baseHost ? `${scheme}://${baseHost}/order/${orderId}` : undefined;

    await sendTransactionalEmail({
      to: order.customer.email,
      subject: buildOrderStatusEmailSubject(status, restaurantName),
      react: OrderReadyEmail({
        restaurantName: restaurant?.name ?? 'Menukaze',
        customerName: order.customer.name,
        publicOrderId: order.publicOrderId,
        orderType: order.type,
        ...(trackingUrl ? { trackingUrl } : {}),
      }),
    });
  } catch (error) {
    captureException(error, {
      surface: 'dashboard:orders',
      message: 'customer status email failed',
    });
  }
}

export async function updateOrderStatusAction(raw: unknown): Promise<UpdateOrderStatusResult> {
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const requiredFlag =
    parsed.data.nextStatus === 'cancelled' ? 'orders.cancel' : 'orders.update_status';
  const orderId = parseObjectId(parsed.data.orderId);
  if (!orderId) return invalidEntityError('order');

  try {
    return await withRestaurantAnyFlagAction(
      [requiredFlag],
      async ({ restaurantId, session, role }) => {
        const actorUserId = parseObjectId(session.user.id);
        if (!actorUserId) {
          throw new Error('Unknown user.');
        }

        const conn = await getMongoConnection('live');
        const { Order } = getModels(conn);

        const order = await Order.findOne({ restaurantId, _id: orderId }).exec();
        if (!order) return { ok: false, error: 'Order not found.' };

        if (!canTransitionOrderStatus(order.status, parsed.data.nextStatus)) {
          return {
            ok: false,
            error: `Cannot transition from ${order.status} to ${parsed.data.nextStatus}.`,
          };
        }

        const now = new Date();
        const isTerminal = isTerminalOrderStatus(parsed.data.nextStatus);
        const isCancel = parsed.data.nextStatus === 'cancelled';

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
        await publishOrderStatusUpdate({
          restaurantId: restaurantIdStr,
          orderId: orderIdStr,
          sessionId: order.sessionId,
          status: parsed.data.nextStatus,
          changedAt: now,
        });
        await sendCustomerStatusEmail({
          conn,
          restaurantId,
          orderId: orderIdStr,
          order,
          status: parsed.data.nextStatus,
        });

        // Map status transitions to the public webhook event catalogue.
        const eventType = webhookEventForOrderStatus(parsed.data.nextStatus);
        if (eventType) {
          await enqueueWebhookEvent(conn, {
            restaurantId,
            eventType,
            data: {
              id: orderIdStr,
              public_order_id: order.publicOrderId,
              channel: orderWebhookChannel(order.channel),
              status: parsed.data.nextStatus,
              total_minor: order.totalMinor,
              currency: order.currency,
              ...(isCancel && parsed.data.cancelReason
                ? { cancel_reason: parsed.data.cancelReason }
                : {}),
            },
          });
        }

        await recordAudit({
          restaurantId,
          userId: session.user.id,
          userEmail: session.user.email,
          role,
          action: 'order.status_changed',
          resourceType: 'order',
          resourceId: orderIdStr,
          metadata: {
            publicOrderId: order.publicOrderId,
            from: order.status,
            to: parsed.data.nextStatus,
            ...(isCancel && parsed.data.cancelReason
              ? { cancelReason: parsed.data.cancelReason }
              : {}),
          },
        });

        return { ok: true, status: parsed.data.nextStatus };
      },
    );
  } catch (error) {
    return actionError(
      error,
      'Failed to update order.',
      'You do not have permission to update this order.',
    );
  }
}
