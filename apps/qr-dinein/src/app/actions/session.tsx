'use server';

import { createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  getMongoConnection,
  getModels,
  generatePublicOrderId,
  getRestaurantSupportRecipients,
  restaurantHasReachedOrderCapacity,
} from '@menukaze/db';
import { channels, type OrderStatus } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import {
  computeTax,
  formatMoney,
  isSessionExpired,
  normalizeDineInSessionTimeoutMinutes,
  parseCurrencyCode,
  validateModifierSelection,
} from '@menukaze/shared';
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

const TIMED_OUT_PAYMENT_FAILURE_REASON = 'Unpaid — Requires Attention';

type SessionTimeoutModels = Pick<ReturnType<typeof getModels>, 'Order' | 'Table' | 'TableSession'>;

function readRazorpayOrderId(order: { id?: unknown }): string {
  if (typeof order.id !== 'string' || order.id.length === 0) {
    throw new Error('Razorpay did not return an order id.');
  }
  return order.id;
}

async function publishTableStatus(
  restaurantId: string,
  tableId: string,
  status: 'available' | 'occupied' | 'bill_requested' | 'paid' | 'needs_review',
  reason?:
    | 'session_started'
    | 'bill_requested'
    | 'payment_succeeded'
    | 'table_released'
    | 'timeout_unpaid',
  changedAt: Date = new Date(),
): Promise<void> {
  try {
    await publishRealtimeEvent(channels.tables(restaurantId), {
      type: 'table.status_changed',
      tableId,
      status,
      changedAt: changedAt.toISOString(),
      ...(reason ? { reason } : {}),
    });
  } catch (error) {
    console.warn('[session] tables publish failed', error);
  }
}

async function publishSessionUpdate(
  restaurantId: string,
  sessionId: string,
  reason:
    | 'participant_joined'
    | 'round_added'
    | 'bill_requested'
    | 'payment_succeeded'
    | 'closed'
    | 'needs_review',
  updatedAt: Date = new Date(),
): Promise<void> {
  try {
    await publishRealtimeEvent(channels.customerSession(restaurantId, sessionId), {
      type: 'session.updated',
      sessionId,
      reason,
      updatedAt: updatedAt.toISOString(),
    });
  } catch (error) {
    console.warn('[session] session publish failed', error);
  }
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
    console.warn('[session] order status publish failed', error);
  }
}

async function moveSessionToNeedsReview(
  models: SessionTimeoutModels,
  session: {
    _id: Types.ObjectId;
    restaurantId: Types.ObjectId;
    tableId: Types.ObjectId;
    status: string;
    customer: { name: string; email: string; phone?: string };
  },
  at: Date,
): Promise<void> {
  if (session.status === 'needs_review' || session.status === 'closed') return;

  await models.Order.updateMany(
    {
      restaurantId: session.restaurantId,
      sessionId: session._id,
      'payment.status': { $in: ['pending', 'processing'] },
    },
    {
      $set: {
        'payment.status': 'failed',
        'payment.failureReason': TIMED_OUT_PAYMENT_FAILURE_REASON,
      },
    },
  ).exec();

  await models.TableSession.updateOne(
    { restaurantId: session.restaurantId, _id: session._id },
    { $set: { status: 'needs_review', closedAt: at } },
  ).exec();
  await models.Table.updateOne(
    { restaurantId: session.restaurantId, _id: session.tableId },
    { $set: { status: 'needs_review' } },
  ).exec();

  const restaurantId = String(session.restaurantId);
  await publishTableStatus(
    restaurantId,
    String(session.tableId),
    'needs_review',
    'timeout_unpaid',
    at,
  );
  await publishSessionUpdate(restaurantId, String(session._id), 'needs_review', at);
  await notifyNeedsReviewByEmail(session, at);
}

async function expireSessionIfTimedOut(
  models: SessionTimeoutModels,
  session: {
    _id: Types.ObjectId;
    restaurantId: Types.ObjectId;
    tableId: Types.ObjectId;
    status: string;
    lastActivityAt: Date;
    customer: { name: string; email: string; phone?: string };
  },
  restaurant: { dineInSessionTimeoutMinutes?: number | null },
): Promise<boolean> {
  if (session.status !== 'active' && session.status !== 'bill_requested') return false;
  if (
    !isSessionExpired(
      session.lastActivityAt,
      normalizeDineInSessionTimeoutMinutes(restaurant.dineInSessionTimeoutMinutes),
    )
  ) {
    return false;
  }
  await moveSessionToNeedsReview(models, session, new Date());
  return true;
}

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
  const { Table, TableSession, Restaurant, Order } = getModels(conn);

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
  const now = new Date();
  const existing = await TableSession.findOne({
    restaurantId,
    tableId: table._id,
    status: { $in: ['active', 'bill_requested'] },
  }).exec();
  if (existing) {
    if (await expireSessionIfTimedOut({ Table, TableSession, Order }, existing, restaurant)) {
      return {
        ok: false,
        error:
          'This table session timed out and now needs staff assistance before a new session can start.',
      };
    }
    const normalizedLabel = parsed.data.name.trim().toLowerCase();
    const participantExists = existing.participants.some(
      (participant) => participant.label.trim().toLowerCase() === normalizedLabel,
    );
    await TableSession.updateOne(
      { restaurantId, _id: existing._id },
      {
        $set: { lastActivityAt: now },
        ...(participantExists
          ? {}
          : {
              $push: {
                participants: { label: parsed.data.name.trim(), joinedAt: now },
              },
            }),
      },
    ).exec();
    await publishSessionUpdate(
      String(restaurantId),
      String(existing._id),
      'participant_joined',
      now,
    );
    return { ok: true, sessionId: String(existing._id), joined: true };
  }

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
  await publishTableStatus(
    String(restaurantId),
    String(table._id),
    'occupied',
    'session_started',
    now,
  );

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
  const { TableSession, Item, Order, Restaurant, Table } = getModels(conn);

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
  if (await expireSessionIfTimedOut({ TableSession, Order, Table }, session, restaurant)) {
    return {
      ok: false,
      error:
        'This session timed out and now needs staff assistance before more items can be added.',
    };
  }
  if (restaurant.throttling?.enabled) {
    const atCapacity = await restaurantHasReachedOrderCapacity(
      conn,
      restaurantId,
      restaurant.throttling.maxConcurrentOrders,
    );
    if (atCapacity) {
      return {
        ok: false,
        error: 'The kitchen is running at capacity right now. Please try again in a few minutes.',
      };
    }
  }

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

    const modifierResult = validateModifierSelection(item.modifiers, line.modifiers, item.name);
    if (!modifierResult.ok) {
      return { ok: false, error: modifierResult.error };
    }
    const resolvedMods = modifierResult.modifiers;
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

  const { taxMinor, surchargeMinor } = computeTax(subtotalMinor, restaurant.taxRules ?? []);
  const totalMinor = subtotalMinor + surchargeMinor;

  const order = await Order.create({
    restaurantId,
    publicOrderId,
    channel: 'qr_dinein',
    type: 'dine_in',
    customer: session.customer,
    items: snapshotLines,
    subtotalMinor,
    taxMinor,
    tipMinor: 0,
    totalMinor,
    currency: restaurant.currency,
    status: 'confirmed',
    statusHistory: [{ status: 'confirmed', at: now }],
    payment: {
      gateway: 'razorpay',
      status: 'pending',
      amountMinor: totalMinor,
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
      totalMinor,
      currency: restaurant.currency,
      createdAt: now.toISOString(),
    });
  } catch (error) {
    console.warn('[session] order publish failed', error);
  }
  await publishSessionUpdate(restaurantIdStr, String(session._id), 'round_added', now);

  return { ok: true, orderId: orderIdStr, publicOrderId };
}

export async function callWaiterAction(
  sessionId: string,
  reason: 'call_waiter' | 'payment_help' = 'call_waiter',
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Types.ObjectId.isValid(sessionId)) return { ok: false, error: 'Unknown session.' };
  const conn = await getMongoConnection('live');
  const { TableSession, Table, Order, Restaurant } = getModels(conn);
  const session = await TableSession.findOne({ _id: new Types.ObjectId(sessionId) }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!session) return { ok: false, error: 'Session not found.' };
  if (session.status === 'closed' || session.status === 'paid') {
    return { ok: false, error: 'This session is already closed.' };
  }

  const restaurant = await Restaurant.findById(session.restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  const expired = await expireSessionIfTimedOut(
    { TableSession, Table, Order },
    session,
    restaurant,
  );

  const now = new Date();
  if (!expired && session.status !== 'needs_review') {
    await TableSession.updateOne(
      { restaurantId: session.restaurantId, _id: session._id },
      { $set: { lastActivityAt: now } },
    ).exec();
  }

  try {
    await publishRealtimeEvent(channels.tables(String(session.restaurantId)), {
      type: 'waiter.called',
      tableId: String(session.tableId),
      sessionId: String(session._id),
      calledAt: now.toISOString(),
      reason,
    });
  } catch (error) {
    console.warn('[session] waiter call publish failed', error);
  }
  return { ok: true };
}

async function notifyNeedsReviewByEmail(
  session: {
    _id: Types.ObjectId;
    restaurantId: Types.ObjectId;
    tableId: Types.ObjectId;
    customer: { name: string; email: string };
  },
  at: Date,
): Promise<void> {
  try {
    const conn = await getMongoConnection('live');
    const { Restaurant, Table, Order } = getModels(conn);
    const recipients = await getRestaurantSupportRecipients(conn, session.restaurantId);
    if (!recipients || recipients.recipients.length === 0) return;

    const [restaurant, table, rounds] = await Promise.all([
      Restaurant.findById(session.restaurantId).exec(),
      Table.findOne({ restaurantId: session.restaurantId, _id: session.tableId }).exec(),
      Order.find({ restaurantId: session.restaurantId, sessionId: session._id }).exec(),
    ]);
    if (!restaurant || !table) return;

    const totalMinor = rounds.reduce((sum, round) => sum + round.totalMinor, 0);
    const totalLabel = formatMoney(
      totalMinor,
      parseCurrencyCode(restaurant.currency),
      restaurant.locale,
    );

    await Promise.all(
      recipients.recipients.map((to) =>
        sendTransactionalEmail({
          to,
          subject: `Payment review needed · ${restaurant.name} · ${table.name}`,
          react: SessionNeedsReviewEmailInline({
            restaurantName: restaurant.name,
            tableName: table.name,
            customerName: session.customer.name,
            totalLabel,
            happenedAt: at.toLocaleString(restaurant.locale, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          }),
        }),
      ),
    );
  } catch (error) {
    console.warn('[session] needs-review email failed', error);
  }
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
  const { TableSession, Order, Restaurant, Table } = getModels(conn);

  const session = await TableSession.findOne({ _id: new Types.ObjectId(sessionId) }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!session) return { ok: false, error: 'Session not found.' };
  if (session.status === 'closed' || session.status === 'paid') {
    return { ok: false, error: 'This session is already closed.' };
  }
  if (session.status === 'needs_review') {
    return {
      ok: false,
      error: 'This session needs staff assistance before payment can continue.',
    };
  }

  const restaurantId = session.restaurantId;
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };
  if (await expireSessionIfTimedOut({ TableSession, Table, Order }, session, restaurant)) {
    return {
      ok: false,
      error: 'This session timed out and now needs staff assistance before payment can continue.',
    };
  }

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
  const razorpayOrderId = readRazorpayOrderId(rzpOrder);

  await TableSession.updateOne(
    { restaurantId, _id: session._id },
    {
      $set: {
        status: 'bill_requested',
        billRequestedAt: now,
        lastActivityAt: now,
        paymentModeRequested: 'online',
      },
    },
  ).exec();
  await Table.updateOne(
    { restaurantId, _id: session.tableId },
    { $set: { status: 'bill_requested' } },
  ).exec();

  // Stamp the Razorpay handshake on the rounds so verify can look them up.
  await Order.updateMany(
    { restaurantId, sessionId: session._id, 'payment.status': 'pending' },
    { $set: { 'payment.razorpayOrderId': razorpayOrderId } },
  ).exec();
  await publishTableStatus(
    String(restaurantId),
    String(session.tableId),
    'bill_requested',
    'bill_requested',
    now,
  );
  await publishSessionUpdate(String(restaurantId), String(session._id), 'bill_requested', now);

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

export async function requestCounterPaymentAction(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Types.ObjectId.isValid(sessionId)) return { ok: false, error: 'Unknown session.' };
  const conn = await getMongoConnection('live');
  const { TableSession, Order, Restaurant, Table } = getModels(conn);

  const session = await TableSession.findOne({ _id: new Types.ObjectId(sessionId) }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!session) return { ok: false, error: 'Session not found.' };
  if (session.status === 'closed' || session.status === 'paid') {
    return { ok: false, error: 'This session is already closed.' };
  }
  if (session.status === 'needs_review') {
    return {
      ok: false,
      error: 'This session already needs staff assistance. A waiter can finish the bill.',
    };
  }

  const restaurant = await Restaurant.findById(session.restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };
  if (await expireSessionIfTimedOut({ TableSession, Table, Order }, session, restaurant)) {
    return {
      ok: false,
      error: 'This session timed out and now needs staff assistance before payment can continue.',
    };
  }

  const rounds = await Order.find({
    restaurantId: session.restaurantId,
    sessionId: session._id,
  }).exec();
  if (rounds.length === 0) {
    return { ok: false, error: 'No rounds in this session yet.' };
  }

  const now = new Date();
  await TableSession.updateOne(
    { restaurantId: session.restaurantId, _id: session._id },
    {
      $set: {
        status: 'bill_requested',
        billRequestedAt: now,
        lastActivityAt: now,
        paymentModeRequested: 'counter',
      },
    },
  ).exec();
  await Table.updateOne(
    { restaurantId: session.restaurantId, _id: session.tableId },
    { $set: { status: 'bill_requested' } },
  ).exec();

  await publishTableStatus(
    String(session.restaurantId),
    String(session.tableId),
    'bill_requested',
    'bill_requested',
    now,
  );
  await publishSessionUpdate(
    String(session.restaurantId),
    String(session._id),
    'bill_requested',
    now,
  );

  try {
    await publishRealtimeEvent(channels.tables(String(session.restaurantId)), {
      type: 'waiter.called',
      tableId: String(session.tableId),
      sessionId: String(session._id),
      calledAt: now.toISOString(),
      reason: 'payment_help',
    });
  } catch (error) {
    console.warn('[session] payment-help publish failed', error);
  }

  return { ok: true };
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
  if (session.status === 'needs_review') {
    return {
      ok: false,
      error: 'This session timed out and now needs staff assistance to finish payment.',
    };
  }

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

  // Transition through paid so the dashboard can reflect the table lifecycle.
  await TableSession.updateOne(
    { restaurantId: session.restaurantId, _id: session._id },
    { $set: { status: 'paid', paidAt: now, lastActivityAt: now, paymentModeRequested: 'online' } },
  ).exec();
  await Table.updateOne(
    { restaurantId: session.restaurantId, _id: session.tableId },
    { $set: { status: 'paid' } },
  ).exec();

  const restaurantIdStr = String(session.restaurantId);
  const completedRounds = await Order.find(
    { restaurantId: session.restaurantId, sessionId: session._id },
    { _id: 1 },
  )
    .lean()
    .exec();
  await publishOrderStatusChanges(
    restaurantIdStr,
    completedRounds.map((round) => String(round._id)),
    'completed',
    now,
  );
  await publishTableStatus(
    restaurantIdStr,
    String(session.tableId),
    'paid',
    'payment_succeeded',
    now,
  );
  await publishSessionUpdate(restaurantIdStr, String(session._id), 'payment_succeeded', now);

  // Then close session and release the table.
  await TableSession.updateOne(
    { restaurantId: session.restaurantId, _id: session._id },
    { $set: { status: 'closed', closedAt: now, lastActivityAt: now } },
  ).exec();
  await Table.updateOne(
    { restaurantId: session.restaurantId, _id: session.tableId },
    { $set: { status: 'available', lastReleasedAt: now } },
  ).exec();
  await publishTableStatus(
    restaurantIdStr,
    String(session.tableId),
    'available',
    'table_released',
    now,
  );
  await publishSessionUpdate(restaurantIdStr, String(session._id), 'closed', now);

  // Fetch the rounds for the receipt. Best-effort email send.
  try {
    const rounds = await Order.find({
      restaurantId: session.restaurantId,
      sessionId: session._id,
    }).exec();
    const currency = parseCurrencyCode(restaurant.currency);
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

function SessionNeedsReviewEmailInline({
  restaurantName,
  tableName,
  customerName,
  totalLabel,
  happenedAt,
}: {
  restaurantName: string;
  tableName: string;
  customerName: string;
  totalLabel: string;
  happenedAt: string;
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
            <h1 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>
              Payment review needed
            </h1>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#71717a' }}>
              {restaurantName} · {tableName} · {happenedAt}
            </p>
            <p style={{ margin: '0 0 8px 0', fontSize: 14 }}>
              {customerName}&apos;s dine-in session timed out before payment completed.
            </p>
            <p style={{ margin: '0 0 8px 0', fontSize: 14 }}>
              Outstanding total: <strong>{totalLabel}</strong>
            </p>
            <p style={{ margin: 0, fontSize: 14 }}>
              Open the dashboard and settle the table manually before releasing it.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
