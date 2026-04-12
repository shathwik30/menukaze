'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { channels, type OrderStatus } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import { formatMoney, parseCurrencyCode } from '@menukaze/shared';
import { sendTransactionalEmail } from '@/lib/email';
import { PermissionDeniedError, requireAnyFlag } from '@/lib/session';

const settleSessionInput = z.object({
  sessionId: z.unknown(),
  method: z.unknown(),
});

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

export async function settleSessionAtCounterAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = settleSessionInput.safeParse(raw);
  if (
    !parsed.success ||
    typeof parsed.data.sessionId !== 'string' ||
    !Types.ObjectId.isValid(parsed.data.sessionId)
  ) {
    return { ok: false, error: 'Unknown session.' };
  }
  if (parsed.data.method !== 'cash' && parsed.data.method !== 'terminal') {
    return { ok: false, error: 'Choose cash or terminal.' };
  }
  const input = { sessionId: parsed.data.sessionId, method: parsed.data.method };

  let sessionUser;
  try {
    ({ session: sessionUser } = await requireAnyFlag(['payments.process']));
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return { ok: false, error: 'You do not have permission to process payments.' };
    }
    throw error;
  }

  const restaurantId = new Types.ObjectId(sessionUser.restaurantId);
  const conn = await getMongoConnection('live');
  const { Restaurant, TableSession, Table, Order } = getModels(conn);

  const session = await TableSession.findOne({
    restaurantId,
    _id: new Types.ObjectId(input.sessionId),
  }).exec();
  if (!session) return { ok: false, error: 'Session not found.' };
  if (session.status === 'closed' || session.status === 'paid') {
    return { ok: false, error: 'This session has already been settled.' };
  }

  const [restaurant, rounds] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Order.find({ restaurantId, sessionId: session._id }).exec(),
  ]);
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };
  if (rounds.length === 0) return { ok: false, error: 'No rounds found for this session.' };

  const now = new Date();
  const methodLabel = input.method === 'terminal' ? 'Counter terminal' : 'Cash at counter';

  await Order.updateMany(
    { restaurantId, sessionId: session._id },
    {
      $set: {
        'payment.gateway': 'cash',
        'payment.status': 'succeeded',
        'payment.methodLabel': methodLabel,
        'payment.paidAt': now,
        status: 'completed',
        completedAt: now,
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
          at: now,
          byUserId: new Types.ObjectId(sessionUser.user.id),
        },
      },
    },
  ).exec();

  await TableSession.updateOne(
    { restaurantId, _id: session._id },
    {
      $set: {
        status: 'paid',
        paidAt: now,
        lastActivityAt: now,
        paymentModeRequested: 'counter',
      },
    },
  ).exec();
  await Table.updateOne(
    { restaurantId, _id: session.tableId },
    { $set: { status: 'paid' } },
  ).exec();

  const restaurantIdStr = String(restaurantId);
  const tableIdStr = String(session.tableId);
  const sessionIdStr = String(session._id);
  const orderIds = rounds.map((round) => String(round._id));
  await publishOrderStatusChanges(restaurantIdStr, orderIds, 'completed', now);

  try {
    await publishRealtimeEvent(channels.tables(restaurantIdStr), {
      type: 'table.status_changed',
      tableId: tableIdStr,
      status: 'paid',
      changedAt: now.toISOString(),
      reason: 'payment_succeeded',
    });
    await publishRealtimeEvent(channels.customerSession(restaurantIdStr, sessionIdStr), {
      type: 'session.updated',
      sessionId: sessionIdStr,
      updatedAt: now.toISOString(),
      reason: 'payment_succeeded',
    });
  } catch (error) {
    console.warn('[dashboard] paid-state publish failed', error);
  }

  await TableSession.updateOne(
    { restaurantId, _id: session._id },
    { $set: { status: 'closed', closedAt: now, lastActivityAt: now } },
  ).exec();
  await Table.updateOne(
    { restaurantId, _id: session.tableId },
    { $set: { status: 'available', lastReleasedAt: now } },
  ).exec();

  try {
    await publishRealtimeEvent(channels.tables(restaurantIdStr), {
      type: 'table.status_changed',
      tableId: tableIdStr,
      status: 'available',
      changedAt: now.toISOString(),
      reason: 'table_released',
    });
    await publishRealtimeEvent(channels.customerSession(restaurantIdStr, sessionIdStr), {
      type: 'session.updated',
      sessionId: sessionIdStr,
      updatedAt: now.toISOString(),
      reason: 'closed',
    });
  } catch (error) {
    console.warn('[dashboard] close-state publish failed', error);
  }

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
      to: session.customer.email,
      subject: `Receipt · ${restaurant.name}`,
      react: CounterSessionReceiptEmailInline({
        restaurantName: restaurant.name,
        customerName: session.customer.name,
        paymentMethodLabel: methodLabel,
        items,
        totalLabel: formatMoney(totalMinor, currency, restaurant.locale),
        paidAt: now.toLocaleString(restaurant.locale, { dateStyle: 'medium', timeStyle: 'short' }),
      }),
    });
  } catch (error) {
    console.warn('[dashboard] counter receipt email failed', error);
  }

  revalidatePath('/admin/tables');
  revalidatePath('/admin/orders');
  return { ok: true };
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
