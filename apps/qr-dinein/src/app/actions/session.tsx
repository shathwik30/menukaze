'use server';

import { createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels, generatePublicOrderId } from '@menukaze/db';
import { channels } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import { formatMoney, type CurrencyCode } from '@menukaze/shared';
import { getRazorpayClient } from '@/lib/razorpay-server';
import { sendTransactionalEmail } from '@/lib/email';

/**
 * QR dine-in server actions (Phase 4 Steps 20 – 23).
 *
 * Flow:
 *   1. startOrJoinSessionAction(qrToken, customer)  → { sessionId }
 *      Looks up the table by its QR token. If there's an active session
 *      for that table, returns it (Step 23 concurrent-scan edge case);
 *      otherwise creates a new session and marks the table occupied.
 *   2. placeRoundAction(sessionId, lines)            → { orderId }
 *      Snapshots line items, creates an Order with sessionId set and
 *      payment still pending, publishes to the KDS + dashboard channels.
 *   3. callWaiterAction(sessionId)                   → {}
 *      Publishes a waiter.called event; the dashboard subscribes.
 *   4. requestBillAction(sessionId)                  → { razorpay payload }
 *      Sums every round Order for the session, creates a Razorpay order
 *      against the session total, and returns the handshake data for
 *      Razorpay Checkout.js.
 *   5. verifySessionPaymentAction                    → { ok }
 *      Verifies the HMAC, marks every round Order paid/completed, stamps
 *      the session paid+closed, releases the table, sends the receipt.
 */

// Spec §7 line 520 — phone is required on session start and is captured for
// future use only (SMS channels light up at Step 51). We accept any string
// that looks roughly phone-shaped and defer full libphonenumber validation
// to Step 51 when SMS delivery actually ships.
const customerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z
    .string()
    .min(7)
    .max(40)
    .regex(/^[\d\s+()\-.]+$/, 'Phone may only contain digits, spaces, and + ( ) - .'),
});

export type StartOrJoinResult =
  | { ok: true; sessionId: string; joined: boolean }
  | { ok: false; error: string };

export async function startOrJoinSessionAction(
  qrToken: string,
  customerRaw: unknown,
): Promise<StartOrJoinResult> {
  const parsed = customerSchema.safeParse(customerRaw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Please fill in every field.',
    };
  }
  if (!qrToken || qrToken.length < 10) return { ok: false, error: 'Invalid QR token.' };

  const conn = await getMongoConnection('live');
  const { Table, TableSession, Restaurant } = getModels(conn);

  const table = await Table.findOne({ qrToken }, null, { skipTenantGuard: true }).exec();
  if (!table) return { ok: false, error: 'Table not found. Please rescan.' };

  const restaurantId = table.restaurantId;
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };
  if (restaurant.holidayMode?.enabled) {
    return {
      ok: false,
      error: restaurant.holidayMode.message ?? 'The restaurant is currently closed.',
    };
  }

  // Concurrent-scan edge case: if there's already an active session on
  // this table, we just join it instead of creating a new one.
  const existing = await TableSession.findOne({
    restaurantId,
    tableId: table._id,
    status: { $in: ['active', 'bill_requested'] },
  }).exec();
  if (existing) {
    await TableSession.updateOne(
      { restaurantId, _id: existing._id },
      {
        $set: { lastActivityAt: new Date() },
        $push: {
          participants: { label: parsed.data.name, joinedAt: new Date() },
        },
      },
    ).exec();
    return { ok: true, sessionId: String(existing._id), joined: true };
  }

  const now = new Date();
  const session = await TableSession.create({
    restaurantId,
    tableId: table._id,
    status: 'active',
    customer: parsed.data,
    participants: [{ label: parsed.data.name, joinedAt: now }],
    startedAt: now,
    lastActivityAt: now,
  });

  // Flip the table to occupied and publish a tables-channel update.
  await Table.updateOne({ restaurantId, _id: table._id }, { $set: { status: 'occupied' } }).exec();

  try {
    await publishRealtimeEvent(channels.tables(String(restaurantId)), {
      type: 'table.status_changed',
      tableId: String(table._id),
      status: 'occupied',
      changedAt: now.toISOString(),
    });
  } catch (error) {
    console.warn('[session] tables publish failed', error);
  }

  return { ok: true, sessionId: String(session._id), joined: false };
}

const modifierInput = z.object({
  groupName: z.string().min(1),
  optionName: z.string().min(1),
  priceMinor: z.number().int().min(0),
});
const lineInput = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  modifiers: z.array(modifierInput).max(20),
  notes: z.string().max(500).optional(),
});
const roundInput = z.object({
  sessionId: z.string().min(1),
  lines: z.array(lineInput).min(1).max(50),
  participantLabel: z.string().max(60).optional(),
});

export type PlaceRoundResult =
  | { ok: true; orderId: string; publicOrderId: string }
  | { ok: false; error: string };

export async function placeRoundAction(raw: unknown): Promise<PlaceRoundResult> {
  const parsed = roundInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid round data.' };
  if (!Types.ObjectId.isValid(parsed.data.sessionId)) {
    return { ok: false, error: 'Unknown session.' };
  }

  const conn = await getMongoConnection('live');
  const { TableSession, Item, Order, Restaurant } = getModels(conn);

  const session = await TableSession.findOne(
    { _id: new Types.ObjectId(parsed.data.sessionId) },
    null,
    { skipTenantGuard: true },
  ).exec();
  if (!session) return { ok: false, error: 'Session not found.' };
  if (session.status !== 'active') {
    return { ok: false, error: 'This session is no longer accepting orders.' };
  }

  const restaurantId = session.restaurantId;
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  for (const line of parsed.data.lines) {
    if (!Types.ObjectId.isValid(line.itemId)) {
      return { ok: false, error: 'Unknown item.' };
    }
  }

  const items = await Item.find({
    restaurantId,
    _id: { $in: parsed.data.lines.map((l) => new Types.ObjectId(l.itemId)) },
  }).exec();
  const itemsById = new Map(items.map((i) => [String(i._id), i]));

  const snapshotLines: Array<{
    itemId: Types.ObjectId;
    name: string;
    priceMinor: number;
    quantity: number;
    modifiers: { groupName: string; optionName: string; priceMinor: number }[];
    notes?: string;
    lineTotalMinor: number;
  }> = [];
  let subtotalMinor = 0;

  for (const line of parsed.data.lines) {
    const item = itemsById.get(line.itemId);
    if (!item) return { ok: false, error: 'Item unavailable.' };
    if (item.soldOut) return { ok: false, error: `${item.name} is sold out.` };

    const resolvedMods: { groupName: string; optionName: string; priceMinor: number }[] = [];
    for (const mod of line.modifiers) {
      const group = item.modifiers.find((g) => g.name === mod.groupName);
      const option = group?.options.find((o) => o.name === mod.optionName);
      if (!group || !option) return { ok: false, error: `Invalid modifier for ${item.name}.` };
      resolvedMods.push({
        groupName: group.name,
        optionName: option.name,
        priceMinor: option.priceMinor,
      });
    }
    const unit = item.priceMinor + resolvedMods.reduce((s, m) => s + m.priceMinor, 0);
    const lineTotal = unit * line.quantity;
    subtotalMinor += lineTotal;
    snapshotLines.push({
      itemId: item._id,
      name: parsed.data.participantLabel
        ? `${item.name} (for ${parsed.data.participantLabel})`
        : item.name,
      priceMinor: item.priceMinor,
      quantity: line.quantity,
      modifiers: resolvedMods,
      ...(line.notes ? { notes: line.notes } : {}),
      lineTotalMinor: lineTotal,
    });
  }

  const publicOrderId = generatePublicOrderId();
  const now = new Date();

  const order = await Order.create({
    restaurantId,
    publicOrderId,
    channel: 'qr_dinein',
    type: 'dine_in',
    customer: session.customer,
    items: snapshotLines,
    subtotalMinor,
    taxMinor: 0,
    tipMinor: 0,
    totalMinor: subtotalMinor,
    currency: restaurant.currency,
    status: 'confirmed',
    statusHistory: [{ status: 'confirmed', at: now }],
    payment: {
      gateway: 'razorpay',
      status: 'pending',
      amountMinor: subtotalMinor,
      currency: restaurant.currency,
    },
    tableId: session.tableId,
    sessionId: session._id,
  });

  await TableSession.updateOne(
    { restaurantId, _id: session._id },
    { $set: { lastActivityAt: now } },
  ).exec();

  const restaurantIdStr = String(restaurantId);
  const orderIdStr = String(order._id);
  try {
    await publishRealtimeEvent(channels.orders(restaurantIdStr), {
      type: 'order.created',
      orderId: orderIdStr,
      channelId: 'qr_dinein',
      totalMinor: subtotalMinor,
      currency: restaurant.currency,
      createdAt: now.toISOString(),
    });
  } catch (error) {
    console.warn('[session] order publish failed', error);
  }

  return { ok: true, orderId: orderIdStr, publicOrderId };
}

export async function callWaiterAction(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Types.ObjectId.isValid(sessionId)) return { ok: false, error: 'Unknown session.' };
  const conn = await getMongoConnection('live');
  const { TableSession } = getModels(conn);
  const session = await TableSession.findOne({ _id: new Types.ObjectId(sessionId) }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!session) return { ok: false, error: 'Session not found.' };

  try {
    await publishRealtimeEvent(channels.tables(String(session.restaurantId)), {
      type: 'waiter.called',
      tableId: String(session.tableId),
      sessionId: String(session._id),
      calledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[session] waiter call publish failed', error);
  }
  return { ok: true };
}

export type RequestBillResult =
  | {
      ok: true;
      razorpayOrderId: string;
      razorpayKeyId: string;
      amountMinor: number;
      currency: string;
      sessionId: string;
      customer: { name: string; email: string; phone?: string };
      restaurantName: string;
    }
  | { ok: false; error: string };

export async function requestBillAction(sessionId: string): Promise<RequestBillResult> {
  if (!Types.ObjectId.isValid(sessionId)) return { ok: false, error: 'Unknown session.' };
  const conn = await getMongoConnection('live');
  const { TableSession, Order, Restaurant } = getModels(conn);

  const session = await TableSession.findOne({ _id: new Types.ObjectId(sessionId) }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!session) return { ok: false, error: 'Session not found.' };
  if (session.status === 'closed' || session.status === 'paid') {
    return { ok: false, error: 'This session is already closed.' };
  }

  const restaurantId = session.restaurantId;
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  const rounds = await Order.find({
    restaurantId,
    sessionId: session._id,
  }).exec();
  if (rounds.length === 0) {
    return { ok: false, error: 'No rounds in this session yet.' };
  }

  const totalMinor = rounds.reduce((s, o) => s + o.totalMinor, 0);

  const razorpay = getRazorpayClient(restaurant);
  if (!razorpay) return { ok: false, error: 'Payments are not set up for this restaurant.' };

  const now = new Date();
  const rzpOrder = await razorpay.client.orders.create({
    amount: totalMinor,
    currency: restaurant.currency,
    receipt: `session-${String(session._id).slice(-12)}`,
    notes: { sessionId: String(session._id), channel: 'qr_dinein' },
  });
  const razorpayOrderId = rzpOrder.id as string;

  await TableSession.updateOne(
    { restaurantId, _id: session._id },
    { $set: { status: 'bill_requested', billRequestedAt: now, lastActivityAt: now } },
  ).exec();

  // Stamp the Razorpay handshake on the rounds so verify can look them up.
  await Order.updateMany(
    { restaurantId, sessionId: session._id, 'payment.status': 'pending' },
    { $set: { 'payment.razorpayOrderId': razorpayOrderId } },
  ).exec();

  return {
    ok: true,
    razorpayOrderId,
    razorpayKeyId: razorpay.keyId,
    amountMinor: totalMinor,
    currency: restaurant.currency,
    sessionId: String(session._id),
    customer: session.customer,
    restaurantName: restaurant.name,
  };
}

const verifyInput = z.object({
  sessionId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
  razorpayOrderId: z.string().min(1),
});

export type VerifySessionPaymentResult = { ok: true } | { ok: false; error: string };

export async function verifySessionPaymentAction(
  raw: unknown,
): Promise<VerifySessionPaymentResult> {
  const parsed = verifyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid verification payload.' };
  if (!Types.ObjectId.isValid(parsed.data.sessionId)) {
    return { ok: false, error: 'Unknown session.' };
  }

  const conn = await getMongoConnection('live');
  const { TableSession, Order, Table, Restaurant } = getModels(conn);

  const session = await TableSession.findOne(
    { _id: new Types.ObjectId(parsed.data.sessionId) },
    null,
    { skipTenantGuard: true },
  ).exec();
  if (!session) return { ok: false, error: 'Session not found.' };

  const restaurant = await Restaurant.findById(session.restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  const razorpay = getRazorpayClient(restaurant);
  if (!razorpay) return { ok: false, error: 'Payments unavailable.' };

  const expected = createHmac('sha256', razorpay.keySecret)
    .update(`${parsed.data.razorpayOrderId}|${parsed.data.razorpayPaymentId}`)
    .digest('hex');
  if (expected !== parsed.data.razorpaySignature) {
    return { ok: false, error: 'Payment signature did not match.' };
  }

  const now = new Date();

  // Mark every round as paid + completed.
  await Order.updateMany(
    { restaurantId: session.restaurantId, sessionId: session._id },
    {
      $set: {
        'payment.status': 'succeeded',
        'payment.razorpayPaymentId': parsed.data.razorpayPaymentId,
        'payment.razorpaySignature': parsed.data.razorpaySignature,
        'payment.paidAt': now,
        status: 'completed',
        completedAt: now,
      },
      $push: { statusHistory: { status: 'completed', at: now } },
    },
  ).exec();

  // Close session, release table.
  await TableSession.updateOne(
    { restaurantId: session.restaurantId, _id: session._id },
    { $set: { status: 'closed', paidAt: now, closedAt: now, lastActivityAt: now } },
  ).exec();
  await Table.updateOne(
    { restaurantId: session.restaurantId, _id: session.tableId },
    { $set: { status: 'available', lastReleasedAt: now } },
  ).exec();

  const restaurantIdStr = String(session.restaurantId);
  try {
    await publishRealtimeEvent(channels.tables(restaurantIdStr), {
      type: 'table.status_changed',
      tableId: String(session.tableId),
      status: 'available',
      changedAt: now.toISOString(),
    });
  } catch (error) {
    console.warn('[session] table release publish failed', error);
  }

  // Fetch the rounds for the receipt. Best-effort email send.
  try {
    const rounds = await Order.find({
      restaurantId: session.restaurantId,
      sessionId: session._id,
    }).exec();
    const currency = restaurant.currency as CurrencyCode;
    const locale = restaurant.locale;
    const totalMinor = rounds.reduce((s, o) => s + o.totalMinor, 0);
    const items = rounds.flatMap((o) =>
      o.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        lineTotalLabel: formatMoney(item.lineTotalMinor, currency, locale),
      })),
    );
    await sendTransactionalEmail({
      to: session.customer.email,
      subject: `Receipt · ${restaurant.name}`,
      react: SessionReceiptEmailInline({
        restaurantName: restaurant.name,
        customerName: session.customer.name,
        items,
        totalLabel: formatMoney(totalMinor, currency, locale),
        paidAt: now.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }),
      }),
    });
  } catch (error) {
    console.warn('[session] receipt email failed', error);
  }

  return { ok: true };
}

// Inline receipt template — kept local because it references a shape
// unique to the session flow (combined rounds) rather than a single order.
function SessionReceiptEmailInline({
  restaurantName,
  customerName,
  items,
  totalLabel,
  paidAt,
}: {
  restaurantName: string;
  customerName: string;
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
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td
                      style={{ padding: '8px 0', borderBottom: '1px solid #f4f4f5', fontSize: 14 }}
                    >
                      {it.quantity}× {it.name}
                    </td>
                    <td
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid #f4f4f5',
                        fontSize: 14,
                        textAlign: 'right',
                      }}
                    >
                      {it.lineTotalLabel}
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
          <p style={{ textAlign: 'center', color: '#a1a1aa', fontSize: 12, marginTop: 24 }}>
            {restaurantName} · Powered by Menukaze
          </p>
        </div>
      </body>
    </html>
  );
}
