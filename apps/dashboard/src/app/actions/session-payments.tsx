'use server';

import { revalidatePath } from 'next/cache';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { channels, type OrderStatus } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import { formatMoney, parseCurrencyCode } from '@menukaze/shared';
import { sendTransactionalEmail } from '@menukaze/shared/transactional-email';
import {
  actionError,
  invalidEntityError,
  validationError,
  withRestaurantAnyFlagAction,
  type ActionResult,
} from '@/lib/action-helpers';

const settleSessionInput = z.object({
  sessionId: z.string().min(1),
  method: z.enum(['cash', 'terminal']),
});

type CounterPaymentMethod = z.infer<typeof settleSessionInput>['method'];

interface CounterSessionRecord {
  _id: Types.ObjectId;
  tableId: Types.ObjectId;
  customer: { name: string; email: string };
}

interface CounterRestaurantRecord {
  name: string;
  currency: string;
  locale: string;
}

interface CounterRoundRecord {
  _id: Types.ObjectId;
  totalMinor: number;
  items: Array<{ name: string; quantity: number; lineTotalMinor: number }>;
}

function getCounterPaymentMethodLabel(method: CounterPaymentMethod): string {
  return method === 'terminal' ? 'Counter terminal' : 'Cash at counter';
}

async function publishOrderStatusChanges(
  restaurantId: string,
  orderIds: string[],
  status: OrderStatus,
  changedAt: Date,
): Promise<void> {
  try {
    await Promise.all(
      orderIds.map((orderId) =>
        publishRealtimeEvent(channels.orders(restaurantId), {
          type: 'order.status_changed',
          orderId,
          status,
          changedAt: changedAt.toISOString(),
        }),
      ),
    );
  } catch (error) {
    console.warn('[dashboard] order status publish failed', error);
  }
}

async function publishTableSessionState({
  restaurantId,
  tableId,
  sessionId,
  tableStatus,
  sessionReason,
  tableReason,
  changedAt,
}: {
  restaurantId: string;
  tableId: string;
  sessionId: string;
  tableStatus: 'paid' | 'available';
  sessionReason: 'payment_succeeded' | 'closed';
  tableReason: 'payment_succeeded' | 'table_released';
  changedAt: Date;
}): Promise<void> {
  try {
    await Promise.all([
      publishRealtimeEvent(channels.tables(restaurantId), {
        type: 'table.status_changed',
        tableId,
        status: tableStatus,
        changedAt: changedAt.toISOString(),
        reason: tableReason,
      }),
      publishRealtimeEvent(channels.customerSession(restaurantId, sessionId), {
        type: 'session.updated',
        sessionId,
        updatedAt: changedAt.toISOString(),
        reason: sessionReason,
      }),
    ]);
  } catch (error) {
    console.warn('[dashboard] table session publish failed', error);
  }
}

async function markCounterRoundsPaid({
  orderModel,
  restaurantId,
  tableSessionId,
  actorUserId,
  methodLabel,
  paidAt,
}: {
  orderModel: ReturnType<typeof getModels>['Order'];
  restaurantId: Types.ObjectId;
  tableSessionId: Types.ObjectId;
  actorUserId: Types.ObjectId;
  methodLabel: string;
  paidAt: Date;
}): Promise<void> {
  await orderModel
    .updateMany(
      { restaurantId, sessionId: tableSessionId },
      {
        $set: {
          'payment.gateway': 'cash',
          'payment.status': 'succeeded',
          'payment.methodLabel': methodLabel,
          'payment.paidAt': paidAt,
          status: 'completed',
          completedAt: paidAt,
        },
        $unset: {
          'payment.failureReason': 1,
          'payment.razorpayOrderId': 1,
          'payment.razorpayPaymentId': 1,
          'payment.razorpaySignature': 1,
        },
        $push: {
          statusHistory: {
            status: 'completed',
            at: paidAt,
            byUserId: actorUserId,
          },
        },
      },
    )
    .exec();
}

async function markCounterSessionPaid({
  tableSessionModel,
  tableModel,
  restaurantId,
  tableSession,
  paidAt,
}: {
  tableSessionModel: ReturnType<typeof getModels>['TableSession'];
  tableModel: ReturnType<typeof getModels>['Table'];
  restaurantId: Types.ObjectId;
  tableSession: CounterSessionRecord;
  paidAt: Date;
}): Promise<void> {
  await tableSessionModel
    .updateOne(
      { restaurantId, _id: tableSession._id },
      {
        $set: {
          status: 'paid',
          paidAt,
          lastActivityAt: paidAt,
          paymentModeRequested: 'counter',
        },
      },
    )
    .exec();
  await tableModel
    .updateOne({ restaurantId, _id: tableSession.tableId }, { $set: { status: 'paid' } })
    .exec();
}

async function releaseCounterSession({
  tableSessionModel,
  tableModel,
  restaurantId,
  tableSession,
  releasedAt,
}: {
  tableSessionModel: ReturnType<typeof getModels>['TableSession'];
  tableModel: ReturnType<typeof getModels>['Table'];
  restaurantId: Types.ObjectId;
  tableSession: CounterSessionRecord;
  releasedAt: Date;
}): Promise<void> {
  await tableSessionModel
    .updateOne(
      { restaurantId, _id: tableSession._id },
      { $set: { status: 'closed', closedAt: releasedAt, lastActivityAt: releasedAt } },
    )
    .exec();
  await tableModel
    .updateOne(
      { restaurantId, _id: tableSession.tableId },
      { $set: { status: 'available', lastReleasedAt: releasedAt } },
    )
    .exec();
}

async function sendCounterReceiptEmail({
  tableSession,
  restaurant,
  rounds,
  methodLabel,
  paidAt,
}: {
  tableSession: CounterSessionRecord;
  restaurant: CounterRestaurantRecord;
  rounds: CounterRoundRecord[];
  methodLabel: string;
  paidAt: Date;
}): Promise<void> {
  try {
    const currency = parseCurrencyCode(restaurant.currency);
    const totalMinor = rounds.reduce((sum, round) => sum + round.totalMinor, 0);
    const items = rounds.flatMap((round) =>
      round.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        lineTotalLabel: formatMoney(item.lineTotalMinor, currency, restaurant.locale),
      })),
    );
    await sendTransactionalEmail({
      to: tableSession.customer.email,
      subject: `Receipt · ${restaurant.name}`,
      react: CounterSessionReceiptEmailInline({
        restaurantName: restaurant.name,
        customerName: tableSession.customer.name,
        paymentMethodLabel: methodLabel,
        items,
        totalLabel: formatMoney(totalMinor, currency, restaurant.locale),
        paidAt: paidAt.toLocaleString(restaurant.locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      }),
    });
  } catch (error) {
    console.warn('[dashboard] counter receipt email failed', error);
  }
}

export async function settleSessionAtCounterAction(raw: unknown): Promise<ActionResult> {
  const parsed = settleSessionInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const sessionId = parseObjectId(parsed.data.sessionId);
  if (!sessionId) return invalidEntityError('session');

  try {
    return await withRestaurantAnyFlagAction(
      ['payments.process'],
      async ({ restaurantId, session }) => {
        const actorUserId = parseObjectId(session.user.id);
        if (!actorUserId) {
          throw new Error('Unknown user.');
        }

        const conn = await getMongoConnection('live');
        const { Restaurant, TableSession, Table, Order } = getModels(conn);

        const tableSession = await TableSession.findOne({ restaurantId, _id: sessionId }).exec();
        if (!tableSession) return { ok: false, error: 'Session not found.' };
        if (tableSession.status === 'closed' || tableSession.status === 'paid') {
          return { ok: false, error: 'This session has already been settled.' };
        }

        const [restaurant, rounds] = await Promise.all([
          Restaurant.findById(restaurantId).exec(),
          Order.find({ restaurantId, sessionId: tableSession._id }).exec(),
        ]);
        if (!restaurant) return { ok: false, error: 'Restaurant not found.' };
        if (rounds.length === 0) return { ok: false, error: 'No rounds found for this session.' };

        const now = new Date();
        const methodLabel = getCounterPaymentMethodLabel(parsed.data.method);
        await markCounterRoundsPaid({
          orderModel: Order,
          restaurantId,
          tableSessionId: tableSession._id,
          actorUserId,
          methodLabel,
          paidAt: now,
        });
        await markCounterSessionPaid({
          tableSessionModel: TableSession,
          tableModel: Table,
          restaurantId,
          tableSession,
          paidAt: now,
        });

        const restaurantIdStr = String(restaurantId);
        const tableIdStr = String(tableSession.tableId);
        const sessionIdStr = String(tableSession._id);
        const orderIds = rounds.map((round) => String(round._id));
        await publishOrderStatusChanges(restaurantIdStr, orderIds, 'completed', now);
        await publishTableSessionState({
          restaurantId: restaurantIdStr,
          tableId: tableIdStr,
          sessionId: sessionIdStr,
          tableStatus: 'paid',
          tableReason: 'payment_succeeded',
          sessionReason: 'payment_succeeded',
          changedAt: now,
        });

        await releaseCounterSession({
          tableSessionModel: TableSession,
          tableModel: Table,
          restaurantId,
          tableSession,
          releasedAt: now,
        });
        await publishTableSessionState({
          restaurantId: restaurantIdStr,
          tableId: tableIdStr,
          sessionId: sessionIdStr,
          tableStatus: 'available',
          tableReason: 'table_released',
          sessionReason: 'closed',
          changedAt: now,
        });

        await sendCounterReceiptEmail({
          tableSession,
          restaurant,
          rounds,
          methodLabel,
          paidAt: now,
        });

        revalidatePath('/admin/tables');
        revalidatePath('/admin/orders');
        return { ok: true };
      },
    );
  } catch (error) {
    return actionError(
      error,
      'Failed to settle session.',
      'You do not have permission to process payments.',
    );
  }
}

function CounterSessionReceiptEmailInline({
  restaurantName,
  customerName,
  paymentMethodLabel,
  items,
  totalLabel,
  paidAt,
}: {
  restaurantName: string;
  customerName: string;
  paymentMethodLabel: string;
  items: Array<{ name: string; quantity: number; lineTotalLabel: string }>;
  totalLabel: string;
  paidAt: string;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: '#f4f4f5',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          color: '#18181b',
        }}
      >
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e4e4e7',
              borderRadius: 8,
              padding: 24,
            }}
          >
            <h1 style={{ margin: '0 0 4px 0', fontSize: 20, fontWeight: 700 }}>
              Thanks, {customerName.split(' ')[0]}!
            </h1>
            <p style={{ margin: '4px 0 16px 0', fontSize: 14, color: '#71717a' }}>
              Dine-in at {restaurantName} · paid {paidAt}
            </p>
            <p style={{ margin: '0 0 16px 0', fontSize: 14 }}>
              Payment method: <strong>{paymentMethodLabel}</strong>
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td
                      style={{ padding: '8px 0', borderBottom: '1px solid #f4f4f5', fontSize: 14 }}
                    >
                      {item.quantity}× {item.name}
                    </td>
                    <td
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid #f4f4f5',
                        fontSize: 14,
                        textAlign: 'right',
                      }}
                    >
                      {item.lineTotalLabel}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '8px 0', fontWeight: 700, fontSize: 15 }}>Total</td>
                  <td
                    style={{
                      padding: '8px 0',
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  >
                    {totalLabel}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  );
}
