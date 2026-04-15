'use server';

import { createHmac } from 'node:crypto';
import { headers } from 'next/headers';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  enqueueWebhookEvent,
  envelopeDecrypt,
  getMongoConnection,
  getModels,
  generatePublicOrderId,
  getRestaurantSupportRecipients,
  restaurantHasReachedOrderCapacity,
  upsertCustomerFromOrder,
} from '@menukaze/db';
import { parseObjectId, parseObjectIds } from '@menukaze/db/object-id';
import { captureException } from '@menukaze/monitoring';
import { channels, type OrderStatus } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import {
  computeTax,
  DEFAULT_DEVICE_SESSION_LIMIT_PER_DAY,
  DEFAULT_DEVICE_WINDOW_HOURS,
  deviceFingerprint,
  formatMoney,
  ipFromHeaders,
  isSessionExpired,
  normalizeDineInSessionTimeoutMinutes,
  parseCurrencyCode,
  preCheckQrLocation,
  resolvePrimaryStationId,
  validateModifierSelection,
} from '@menukaze/shared';
import { getRazorpayClientFromEncryptedKeys } from '@menukaze/shared/razorpay';
import { sendTransactionalEmail } from '@menukaze/shared/transactional-email';
import { getZodErrorMessage } from '@menukaze/shared/validation';
import { SessionNeedsReviewEmail } from '@/emails/session-needs-review';
import { SessionReceiptEmail } from '@/emails/session-receipt';

/** Server actions for QR dine-in session lifecycle, billing, and payment. */

// Keep phone validation lightweight for now. We only need a reasonable
// user-entered contact string until SMS delivery is added.
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
    captureException(error, { surface: 'qr-dinein:session', message: 'tables publish failed' });
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
    captureException(error, { surface: 'qr-dinein:session', message: 'session publish failed' });
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
    captureException(error, {
      surface: 'qr-dinein:session',
      message: 'order status publish failed',
    });
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

/**
 * Cheap anomaly heuristics on a new round. Returns the reason string when an
 * order should be flagged, or null when it looks normal. Called inline by
 * `placeRoundAction` — keep it fast (a single Mongo query).
 */
async function detectSessionAnomaly(
  orderModel: ReturnType<typeof getModels>['Order'],
  tableModel: ReturnType<typeof getModels>['Table'],
  restaurantId: Types.ObjectId,
  session: { _id: Types.ObjectId; tableId: Types.ObjectId },
  newOrderTotalMinor: number,
  now: Date,
): Promise<string | null> {
  const previous = await orderModel
    .findOne(
      { restaurantId, sessionId: session._id },
      { createdAt: 1, totalMinor: 1 },
      { sort: { createdAt: -1 } },
    )
    .exec();
  if (previous) {
    const elapsedMs = now.getTime() - previous.createdAt.getTime();
    if (elapsedMs < 90_000) {
      return 'Two rounds placed within 90 seconds.';
    }
  }
  const table = await tableModel.findOne({ restaurantId, _id: session.tableId }).exec();
  if (table) {
    // 50,000 minor units (~₹500/$5) per seat is the rough upper bound for a
    // single round in mainstream cuisines. Cheap signal, never the only one.
    const plausibleCap = table.capacity * 50_000;
    if (newOrderTotalMinor > plausibleCap * 4) {
      return `Round total exceeds 4x plausible cap for ${table.capacity}-seat table.`;
    }
  }
  return null;
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

type SessionModels = Pick<
  ReturnType<typeof getModels>,
  'Item' | 'Order' | 'Restaurant' | 'Table' | 'TableSession'
>;

interface SessionRecord {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  tableId: Types.ObjectId;
  status: string;
  customer: { name: string; email: string; phone?: string };
  participants: Array<{ label: string; joinedAt: Date }>;
  lastActivityAt: Date;
  firstOrderAllowedAt?: Date | null;
  deviceFingerprint?: string | null;
}

interface SessionRestaurantRecord {
  name: string;
  slug: string;
  currency: string;
  locale: string;
  razorpayKeyIdEnc?: string | null;
  razorpayKeySecretEnc?: string | null;
  holidayMode?: { enabled?: boolean; message?: string } | null;
  throttling?: { enabled?: boolean; maxConcurrentOrders: number } | null;
  dineInSessionTimeoutMinutes?: number | null;
  taxRules?: Array<{
    name: string;
    percent: number;
    inclusive: boolean;
    scope: 'order' | 'item';
    label?: string;
  }> | null;
}

interface SessionRoundLineSnapshot {
  itemId: Types.ObjectId;
  name: string;
  priceMinor: number;
  quantity: number;
  modifiers: { groupName: string; optionName: string; priceMinor: number }[];
  notes?: string;
  lineTotalMinor: number;
}

async function loadSessionById(
  tableSessionModel: ReturnType<typeof getModels>['TableSession'],
  sessionId: Types.ObjectId,
): Promise<SessionRecord | null> {
  return tableSessionModel.findOne({ _id: sessionId }, null, { skipTenantGuard: true }).exec();
}

async function loadSessionRestaurant(
  restaurantModel: ReturnType<typeof getModels>['Restaurant'],
  restaurantId: Types.ObjectId,
): Promise<SessionRestaurantRecord | null> {
  return restaurantModel.findById(restaurantId).exec();
}

async function buildRoundSnapshot(
  itemModel: ReturnType<typeof getModels>['Item'],
  categoryModel: ReturnType<typeof getModels>['Category'],
  restaurantId: Types.ObjectId,
  lines: z.infer<typeof lineInput>[],
  participantLabel?: string,
): Promise<
  { snapshotLines: SessionRoundLineSnapshot[]; subtotalMinor: number } | { error: string }
> {
  const itemIds = parseObjectIds(lines.map((line) => line.itemId));
  if (!itemIds) {
    return { error: 'Unknown item.' };
  }

  const items = await itemModel.find({ restaurantId, _id: { $in: itemIds } }).exec();
  const itemsById = new Map(items.map((item) => [String(item._id), item]));
  const categoryIds = Array.from(new Set(items.map((item) => String(item.categoryId))));
  const categories =
    categoryIds.length > 0
      ? await categoryModel
          .find({ restaurantId, _id: { $in: categoryIds } }, { stationIds: 1 })
          .lean()
          .exec()
      : [];
  const categoryStationsById = new Map(categories.map((c) => [String(c._id), c.stationIds ?? []]));

  const snapshotLines: SessionRoundLineSnapshot[] = [];
  let subtotalMinor = 0;

  for (const line of lines) {
    const item = itemsById.get(line.itemId);
    if (!item) return { error: 'Item unavailable.' };
    if (item.soldOut) return { error: `${item.name} is sold out.` };

    const modifierResult = validateModifierSelection(item.modifiers, line.modifiers, item.name);
    if (!modifierResult.ok) {
      return { error: modifierResult.error };
    }

    const resolvedModifiers = modifierResult.modifiers;
    const unitMinor =
      item.priceMinor + resolvedModifiers.reduce((sum, modifier) => sum + modifier.priceMinor, 0);
    const lineTotalMinor = unitMinor * line.quantity;
    subtotalMinor += lineTotalMinor;

    const stationId = resolvePrimaryStationId(
      item.stationIds ?? null,
      categoryStationsById.get(String(item.categoryId)) ?? null,
    );

    snapshotLines.push({
      itemId: item._id,
      name: participantLabel ? `${item.name} (for ${participantLabel})` : item.name,
      priceMinor: item.priceMinor,
      quantity: line.quantity,
      modifiers: resolvedModifiers,
      ...(line.notes ? { notes: line.notes } : {}),
      lineTotalMinor,
      ...(stationId ? { stationId } : {}),
    });
  }

  return { snapshotLines, subtotalMinor };
}

async function touchSession(
  tableSessionModel: ReturnType<typeof getModels>['TableSession'],
  session: Pick<SessionRecord, '_id' | 'restaurantId'>,
  lastActivityAt: Date,
): Promise<void> {
  await tableSessionModel
    .updateOne(
      { restaurantId: session.restaurantId, _id: session._id },
      { $set: { lastActivityAt } },
    )
    .exec();
}

async function publishWaiterCall(
  session: Pick<SessionRecord, '_id' | 'restaurantId' | 'tableId'>,
  reason: 'call_waiter' | 'payment_help',
  calledAt: Date,
): Promise<void> {
  try {
    await publishRealtimeEvent(channels.tables(String(session.restaurantId)), {
      type: 'waiter.called',
      tableId: String(session.tableId),
      sessionId: String(session._id),
      calledAt: calledAt.toISOString(),
      reason,
    });
  } catch (error) {
    captureException(error, {
      surface: 'qr-dinein:session',
      message: 'waiter call publish failed',
    });
  }
}

async function markSessionBillRequested(
  models: Pick<SessionModels, 'Order' | 'Table' | 'TableSession'>,
  session: Pick<SessionRecord, '_id' | 'restaurantId' | 'tableId'>,
  requestedAt: Date,
  paymentModeRequested: 'online' | 'counter',
  razorpayOrderId?: string,
): Promise<void> {
  await models.TableSession.updateOne(
    { restaurantId: session.restaurantId, _id: session._id },
    {
      $set: {
        status: 'bill_requested',
        billRequestedAt: requestedAt,
        lastActivityAt: requestedAt,
        paymentModeRequested,
      },
    },
  ).exec();
  await models.Table.updateOne(
    { restaurantId: session.restaurantId, _id: session.tableId },
    { $set: { status: 'bill_requested' } },
  ).exec();

  if (razorpayOrderId) {
    await models.Order.updateMany(
      {
        restaurantId: session.restaurantId,
        sessionId: session._id,
        'payment.status': 'pending',
      },
      { $set: { 'payment.razorpayOrderId': razorpayOrderId } },
    ).exec();
  }

  await publishTableStatus(
    String(session.restaurantId),
    String(session.tableId),
    'bill_requested',
    'bill_requested',
    requestedAt,
  );
  await publishSessionUpdate(
    String(session.restaurantId),
    String(session._id),
    'bill_requested',
    requestedAt,
  );
}

async function releasePaidSession(
  models: Pick<SessionModels, 'Table' | 'TableSession'>,
  session: Pick<SessionRecord, '_id' | 'restaurantId' | 'tableId'>,
  paidAt: Date,
): Promise<void> {
  await models.TableSession.updateOne(
    { restaurantId: session.restaurantId, _id: session._id },
    { $set: { status: 'paid', paidAt, lastActivityAt: paidAt, paymentModeRequested: 'online' } },
  ).exec();
  await models.Table.updateOne(
    { restaurantId: session.restaurantId, _id: session.tableId },
    { $set: { status: 'paid' } },
  ).exec();

  const restaurantId = String(session.restaurantId);
  await publishTableStatus(
    restaurantId,
    String(session.tableId),
    'paid',
    'payment_succeeded',
    paidAt,
  );
  await publishSessionUpdate(restaurantId, String(session._id), 'payment_succeeded', paidAt);

  await models.TableSession.updateOne(
    { restaurantId: session.restaurantId, _id: session._id },
    { $set: { status: 'closed', closedAt: paidAt, lastActivityAt: paidAt } },
  ).exec();
  await models.Table.updateOne(
    { restaurantId: session.restaurantId, _id: session.tableId },
    { $set: { status: 'available', lastReleasedAt: paidAt } },
  ).exec();
  await publishTableStatus(
    restaurantId,
    String(session.tableId),
    'available',
    'table_released',
    paidAt,
  );
  await publishSessionUpdate(restaurantId, String(session._id), 'closed', paidAt);
}

async function sendSessionReceiptEmail(
  session: Pick<SessionRecord, '_id' | 'restaurantId' | 'customer'>,
  restaurant: SessionRestaurantRecord,
  paidAt: Date,
  orderModel: ReturnType<typeof getModels>['Order'],
): Promise<void> {
  try {
    const rounds = await orderModel
      .find({
        restaurantId: session.restaurantId,
        sessionId: session._id,
      })
      .exec();
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
      react: SessionReceiptEmail({
        restaurantName: restaurant.name,
        customerName: session.customer.name,
        items,
        totalLabel: formatMoney(totalMinor, currency, restaurant.locale),
        paidAt: paidAt.toLocaleString(restaurant.locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      }),
    });
  } catch (error) {
    captureException(error, { surface: 'qr-dinein:session', message: 'receipt email failed' });
  }
}

const startSessionContextSchema = z
  .object({
    coords: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    clientHint: z.string().max(64).optional(),
  })
  .optional();

export type StartOrJoinResult =
  | {
      ok: true;
      sessionId: string;
      joined: boolean;
      firstOrderAllowedAt?: string;
    }
  | {
      ok: false;
      error: string;
      code?: 'outside_geofence' | 'no_location' | 'wifi_required' | 'rate_limited';
    };

export async function startOrJoinSessionAction(
  qrToken: string,
  customerRaw: unknown,
  contextRaw?: unknown,
): Promise<StartOrJoinResult> {
  const parsed = customerSchema.safeParse(customerRaw);
  if (!parsed.success) {
    return { ok: false, error: getZodErrorMessage(parsed.error, 'Please fill in every field.') };
  }
  const contextParsed = startSessionContextSchema.safeParse(contextRaw ?? undefined);
  if (!contextParsed.success) {
    return { ok: false, error: 'Invalid location data.' };
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

  const requestHeaders = await headers();
  const ip = ipFromHeaders(requestHeaders);
  const fingerprint = deviceFingerprint({
    ip,
    userAgent: requestHeaders.get('user-agent'),
    acceptLanguage: requestHeaders.get('accept-language'),
    clientHint: contextParsed.data?.clientHint ?? null,
  });

  const locationCheck = preCheckQrLocation({
    restaurant: {
      coordinates: restaurant.geo.coordinates,
      geofenceRadiusM: restaurant.hardening?.geofenceRadiusM ?? restaurant.geofenceRadiusM,
      wifiPublicIps: restaurant.wifiPublicIps,
      hardening: {
        strictMode: restaurant.hardening?.strictMode,
        wifiGate: restaurant.hardening?.wifiGate,
      },
    },
    coords: contextParsed.data?.coords ?? null,
    ip,
  });
  if (!locationCheck.ok) {
    return { ok: false, error: locationCheck.error, code: locationCheck.code };
  }

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
    return {
      ok: true,
      sessionId: String(existing._id),
      joined: true,
      ...(existing.firstOrderAllowedAt
        ? { firstOrderAllowedAt: existing.firstOrderAllowedAt.toISOString() }
        : {}),
    };
  }

  // Per-table cap (default 1 active session). Belt-and-braces: the active-
  // session lookup above already serializes scans, but a configurable cap
  // makes large-table split-bill workflows possible.
  const maxSessionsPerTable = restaurant.hardening?.maxSessionsPerTable ?? 1;
  const activeSessionsForTable = await TableSession.countDocuments({
    restaurantId,
    tableId: table._id,
    status: { $in: ['active', 'bill_requested'] },
  }).exec();
  if (activeSessionsForTable >= maxSessionsPerTable) {
    return {
      ok: false,
      error: 'This table already has the maximum number of active sessions.',
      code: 'rate_limited',
    };
  }

  // Per-device 24h cap across the whole restaurant.
  const since = new Date(now.getTime() - DEFAULT_DEVICE_WINDOW_HOURS * 60 * 60 * 1000);
  const deviceCount = await TableSession.countDocuments({
    restaurantId,
    deviceFingerprint: fingerprint,
    startedAt: { $gte: since },
  }).exec();
  if (deviceCount >= DEFAULT_DEVICE_SESSION_LIMIT_PER_DAY) {
    return {
      ok: false,
      error: 'Too many sessions started from this device today. Please ask your server.',
      code: 'rate_limited',
    };
  }

  const firstOrderDelaySeconds = restaurant.hardening?.firstOrderDelayS ?? 0;
  const firstOrderAllowedAt =
    firstOrderDelaySeconds > 0 ? new Date(now.getTime() + firstOrderDelaySeconds * 1000) : null;

  const session = await TableSession.create({
    restaurantId,
    tableId: table._id,
    status: 'active',
    customer: parsed.data,
    participants: [{ label: parsed.data.name, joinedAt: now }],
    deviceFingerprint: fingerprint,
    ...(firstOrderAllowedAt ? { firstOrderAllowedAt } : {}),
    startedAt: now,
    lastActivityAt: now,
  });

  await Table.updateOne({ restaurantId, _id: table._id }, { $set: { status: 'occupied' } }).exec();
  await publishTableStatus(
    String(restaurantId),
    String(table._id),
    'occupied',
    'session_started',
    now,
  );

  return {
    ok: true,
    sessionId: String(session._id),
    joined: false,
    ...(firstOrderAllowedAt ? { firstOrderAllowedAt: firstOrderAllowedAt.toISOString() } : {}),
  };
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
  if (!parsed.success) {
    return { ok: false, error: getZodErrorMessage(parsed.error, 'Invalid round data.') };
  }

  const sessionId = parseObjectId(parsed.data.sessionId);
  if (!sessionId) {
    return { ok: false, error: 'Unknown session.' };
  }

  const conn = await getMongoConnection('live');
  const { TableSession, Item, Order, Restaurant, Table, Category } = getModels(conn);

  const session = await loadSessionById(TableSession, sessionId);
  if (!session) return { ok: false, error: 'Session not found.' };
  if (session.status !== 'active') {
    return { ok: false, error: 'This session is no longer accepting orders.' };
  }

  const restaurantId = session.restaurantId;
  const restaurant = await loadSessionRestaurant(Restaurant, restaurantId);
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };
  if (await expireSessionIfTimedOut({ TableSession, Order, Table }, session, restaurant)) {
    return {
      ok: false,
      error:
        'This session timed out and now needs staff assistance before more items can be added.',
    };
  }
  const placedAt = new Date();
  if (session.firstOrderAllowedAt && placedAt < session.firstOrderAllowedAt) {
    const waitSeconds = Math.ceil(
      (session.firstOrderAllowedAt.getTime() - placedAt.getTime()) / 1000,
    );
    return {
      ok: false,
      error: `Please wait ${waitSeconds}s before placing your first order.`,
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

  const roundSnapshot = await buildRoundSnapshot(
    Item,
    Category,
    restaurantId,
    parsed.data.lines,
    parsed.data.participantLabel,
  );
  if ('error' in roundSnapshot) {
    return { ok: false, error: roundSnapshot.error };
  }

  const publicOrderId = generatePublicOrderId();
  const now = placedAt;

  const { taxMinor, surchargeMinor } = computeTax(
    roundSnapshot.subtotalMinor,
    restaurant.taxRules ?? [],
  );
  const totalMinor = roundSnapshot.subtotalMinor + surchargeMinor;

  // Anomaly detection: flag rounds placed within 90s of the previous round
  // when the running session total is well above what the table seats can
  // plausibly consume. Suspicious rounds still flow to the KDS but surface
  // a banner to staff.
  const anomaly = await detectSessionAnomaly(Order, Table, restaurantId, session, totalMinor, now);

  const order = await Order.create({
    restaurantId,
    publicOrderId,
    channel: 'qr_dinein',
    type: 'dine_in',
    customer: session.customer,
    items: roundSnapshot.snapshotLines,
    subtotalMinor: roundSnapshot.subtotalMinor,
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
    ...(anomaly ? { suspicious: true, suspiciousReason: anomaly } : {}),
  });

  await upsertCustomerFromOrder(conn, {
    restaurantId,
    email: session.customer.email,
    name: session.customer.name,
    ...(session.customer.phone ? { phone: session.customer.phone } : {}),
    channel: 'qr_dinein',
    totalMinor,
    currency: restaurant.currency,
  });

  await enqueueWebhookEvent(conn, {
    restaurantId,
    eventType: 'order.created',
    data: {
      id: String(order._id),
      public_order_id: publicOrderId,
      channel: { id: 'qr_dinein', type: 'built_in' },
      type: 'dine_in',
      table_session_id: String(session._id),
      total_minor: totalMinor,
      currency: restaurant.currency,
      status: 'confirmed',
    },
  });

  await touchSession(TableSession, session, now);

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
    captureException(error, { surface: 'qr-dinein:session', message: 'order publish failed' });
  }
  await publishSessionUpdate(restaurantIdStr, String(session._id), 'round_added', now);

  return { ok: true, orderId: orderIdStr, publicOrderId };
}

export async function callWaiterAction(
  sessionId: string,
  reason: 'call_waiter' | 'payment_help' = 'call_waiter',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tableSessionId = parseObjectId(sessionId);
  if (!tableSessionId) return { ok: false, error: 'Unknown session.' };
  const conn = await getMongoConnection('live');
  const { TableSession, Table, Order, Restaurant } = getModels(conn);
  const session = await loadSessionById(TableSession, tableSessionId);
  if (!session) return { ok: false, error: 'Session not found.' };
  if (session.status === 'closed' || session.status === 'paid') {
    return { ok: false, error: 'This session is already closed.' };
  }

  const restaurant = await loadSessionRestaurant(Restaurant, session.restaurantId);
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  const expired = await expireSessionIfTimedOut(
    { TableSession, Table, Order },
    session,
    restaurant,
  );

  const now = new Date();
  if (!expired && session.status !== 'needs_review') {
    await touchSession(TableSession, session, now);
  }

  await publishWaiterCall(session, reason, now);
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
          react: SessionNeedsReviewEmail({
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
    captureException(error, {
      surface: 'qr-dinein:session',
      message: 'needs-review email failed',
    });
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
  const tableSessionId = parseObjectId(sessionId);
  if (!tableSessionId) return { ok: false, error: 'Unknown session.' };
  const conn = await getMongoConnection('live');
  const { TableSession, Order, Restaurant, Table } = getModels(conn);

  const session = await loadSessionById(TableSession, tableSessionId);
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
  const restaurant = await loadSessionRestaurant(Restaurant, restaurantId);
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

  const razorpay = getRazorpayClientFromEncryptedKeys(restaurant, envelopeDecrypt);
  if (!razorpay) return { ok: false, error: 'Payments are not set up for this restaurant.' };

  const now = new Date();
  const rzpOrder = await razorpay.client.orders.create({
    amount: totalMinor,
    currency: restaurant.currency,
    receipt: `session-${String(session._id).slice(-12)}`,
    notes: { sessionId: String(session._id), channel: 'qr_dinein' },
  });
  const razorpayOrderId = readRazorpayOrderId(rzpOrder);

  await markSessionBillRequested(
    { Order, Table, TableSession },
    session,
    now,
    'online',
    razorpayOrderId,
  );

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
  const tableSessionId = parseObjectId(sessionId);
  if (!tableSessionId) return { ok: false, error: 'Unknown session.' };
  const conn = await getMongoConnection('live');
  const { TableSession, Order, Restaurant, Table } = getModels(conn);

  const session = await loadSessionById(TableSession, tableSessionId);
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

  const restaurant = await loadSessionRestaurant(Restaurant, session.restaurantId);
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
  await markSessionBillRequested({ Order, Table, TableSession }, session, now, 'counter');
  await publishWaiterCall(session, 'payment_help', now);

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
  if (!parsed.success) {
    return { ok: false, error: getZodErrorMessage(parsed.error, 'Invalid verification payload.') };
  }

  const sessionId = parseObjectId(parsed.data.sessionId);
  if (!sessionId) {
    return { ok: false, error: 'Unknown session.' };
  }

  const conn = await getMongoConnection('live');
  const { TableSession, Order, Table, Restaurant } = getModels(conn);

  const session = await loadSessionById(TableSession, sessionId);
  if (!session) return { ok: false, error: 'Session not found.' };
  if (session.status === 'needs_review') {
    return {
      ok: false,
      error: 'This session timed out and now needs staff assistance to finish payment.',
    };
  }

  const restaurant = await loadSessionRestaurant(Restaurant, session.restaurantId);
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  const razorpay = getRazorpayClientFromEncryptedKeys(restaurant, envelopeDecrypt);
  if (!razorpay) return { ok: false, error: 'Payments unavailable.' };

  const expected = createHmac('sha256', razorpay.keySecret)
    .update(`${parsed.data.razorpayOrderId}|${parsed.data.razorpayPaymentId}`)
    .digest('hex');
  if (expected !== parsed.data.razorpaySignature) {
    return { ok: false, error: 'Payment signature did not match.' };
  }

  const now = new Date();

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

  const completedRounds = await Order.find(
    { restaurantId: session.restaurantId, sessionId: session._id },
    { _id: 1 },
  )
    .lean()
    .exec();
  await publishOrderStatusChanges(
    String(session.restaurantId),
    completedRounds.map((round) => String(round._id)),
    'completed',
    now,
  );
  await releasePaidSession({ Table, TableSession }, session, now);
  await sendSessionReceiptEmail(session, restaurant, now, Order);

  return { ok: true };
}
