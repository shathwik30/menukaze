'use server';

import { timingSafeEqual } from 'node:crypto';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  enqueueWebhookEvent,
  envelopeDecrypt,
  generatePublicOrderId,
  getModels,
  getMongoConnection,
  pickLeastLoadedStationId,
  reserveDailyPickupNumber,
  restaurantHasReachedOrderCapacity,
} from '@menukaze/db';
import { parseObjectId, parseObjectIds } from '@menukaze/db/object-id';
import { captureException } from '@menukaze/monitoring';
import { channels } from '@menukaze/realtime';
import { env } from '@/env';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import {
  computeTax,
  DEFAULT_PREP_MINUTES,
  formatMoney,
  kioskPlaceholderEmail,
  orderWebhookChannel,
  parseCurrencyCode,
  resolvePrimaryStationId,
  validateModifierSelection,
} from '@menukaze/shared';
import {
  getRazorpayClientFromEncryptedKeys,
  readRazorpayOrderId,
  verifyRazorpayPaymentSignature,
} from '@menukaze/shared/razorpay';
import { getZodErrorMessage } from '@menukaze/shared/validation';

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

const kioskOrderInput = z.object({
  restaurantId: z.string().min(1),
  orderMode: z.enum(['dine_in', 'takeaway']),
  customerName: z.string().min(1).max(200),
  lines: z.array(lineInput).min(1).max(50),
});

export type KioskOrderInput = z.infer<typeof kioskOrderInput>;

export type CreateKioskIntentResult =
  | {
      ok: true;
      orderId: string;
      publicOrderId: string;
      razorpayOrderId: string;
      razorpayKeyId: string;
      amountMinor: number;
      currency: string;
      customerName: string;
    }
  | { ok: false; error: string };

export async function createKioskOrderAction(raw: unknown): Promise<CreateKioskIntentResult> {
  const parsed = kioskOrderInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: getZodErrorMessage(parsed.error, 'Invalid order data.') };
  }
  const input = parsed.data;

  const restaurantId = parseObjectId(input.restaurantId);
  if (!restaurantId) return { ok: false, error: 'Unknown restaurant.' };

  const itemIds = parseObjectIds(input.lines.map((l) => l.itemId));
  if (!itemIds) return { ok: false, error: 'Unknown item.' };

  const conn = await getMongoConnection('live');
  const { Restaurant, Item, Order, Category } = getModels(conn);

  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };
  if (!restaurant.liveAt)
    return { ok: false, error: 'This restaurant is not accepting orders yet.' };

  if (restaurant.holidayMode?.enabled) {
    return {
      ok: false,
      error: restaurant.holidayMode.message ?? 'The restaurant is currently closed.',
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
        error: 'The kitchen is at capacity right now. Please try again in a few minutes.',
      };
    }
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
  const categoryStationsById = new Map(categories.map((c) => [String(c._id), c.stationIds ?? []]));

  const currency = parseCurrencyCode(restaurant.currency);
  const locale = restaurant.locale;

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

  const snapshotLines: SnapshotLine[] = [];
  let subtotalMinor = 0;

  for (const line of input.lines) {
    const item = itemsById.get(line.itemId);
    if (!item) return { ok: false, error: 'Item no longer available.' };
    if (item.soldOut) return { ok: false, error: `${item.name} is sold out.` };
    if (item.currency !== restaurant.currency) {
      return { ok: false, error: `Currency mismatch for ${item.name}.` };
    }

    const modResult = validateModifierSelection(item.modifiers, line.modifiers, item.name);
    if (!modResult.ok) return { ok: false, error: modResult.error };

    const unitMinor = item.priceMinor + modResult.modifiers.reduce((s, m) => s + m.priceMinor, 0);
    const lineTotalMinor = unitMinor * line.quantity;
    subtotalMinor += lineTotalMinor;

    const itemStations = item.stationIds ?? [];
    const categoryStations = categoryStationsById.get(String(item.categoryId)) ?? [];
    const candidates = itemStations.length > 0 ? itemStations : categoryStations;
    const stationId =
      candidates.length > 1
        ? await pickLeastLoadedStationId(conn, restaurantId, candidates)
        : resolvePrimaryStationId(item.stationIds ?? null, categoryStations);

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

  if (subtotalMinor <= 0) return { ok: false, error: 'Your cart is empty.' };

  const minimumOrderMinor = restaurant.minimumOrderMinor ?? 0;
  if (minimumOrderMinor > 0 && subtotalMinor < minimumOrderMinor) {
    return {
      ok: false,
      error: `Minimum order is ${formatMoney(minimumOrderMinor, currency, locale)}.`,
    };
  }

  const { surchargeMinor, taxMinor } = computeTax(subtotalMinor, restaurant.taxRules ?? []);
  const totalMinor = subtotalMinor + surchargeMinor;
  if (totalMinor <= 0) return { ok: false, error: 'Your cart is empty.' };

  const razorpay = getRazorpayClientFromEncryptedKeys(restaurant, envelopeDecrypt);
  if (!razorpay) {
    return { ok: false, error: 'This restaurant has not finished setting up payments.' };
  }

  const publicOrderId = generatePublicOrderId();
  const pickupNumber = await reserveDailyPickupNumber(conn, restaurantId, restaurant.timezone);

  const rzpOrder = await razorpay.client.orders.create({
    amount: totalMinor,
    currency: restaurant.currency,
    receipt: publicOrderId,
    notes: {
      restaurantId: String(restaurantId),
      publicOrderId,
      channel: 'kiosk',
    },
  });
  const razorpayOrderId = readRazorpayOrderId(rzpOrder);

  const prepMinutes = restaurant.estimatedPrepMinutes ?? DEFAULT_PREP_MINUTES;
  const estimatedReadyAt = new Date(Date.now() + prepMinutes * 60_000);

  // Kiosk orders use a placeholder email; no receipt is sent.
  const order = await Order.create({
    restaurantId,
    publicOrderId,
    pickupNumber,
    channel: 'kiosk',
    type: input.orderMode === 'dine_in' ? 'dine_in' : 'pickup',
    customer: {
      name: input.customerName,
      email: kioskPlaceholderEmail(publicOrderId),
    },
    items: snapshotLines,
    subtotalMinor,
    taxMinor,
    tipMinor: 0,
    totalMinor,
    currency: restaurant.currency,
    status: 'received',
    statusHistory: [{ status: 'received', at: new Date() }],
    estimatedReadyAt,
    payment: {
      gateway: 'razorpay',
      status: 'pending',
      amountMinor: totalMinor,
      currency: restaurant.currency,
      razorpayOrderId,
    },
  });

  return {
    ok: true,
    orderId: String(order._id),
    publicOrderId,
    razorpayOrderId,
    razorpayKeyId: razorpay.keyId,
    amountMinor: totalMinor,
    currency: restaurant.currency,
    customerName: input.customerName,
  };
}

// ---------------------------------------------------------------------------
// Verify payment
// ---------------------------------------------------------------------------

const verifyInput = z.object({
  orderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export type VerifyKioskPaymentResult =
  | { ok: true; publicOrderId: string; orderId: string }
  | { ok: false; error: string };

export async function verifyKioskPaymentAction(raw: unknown): Promise<VerifyKioskPaymentResult> {
  const parsed = verifyInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: getZodErrorMessage(parsed.error, 'Invalid verification payload.') };
  }
  const input = parsed.data;

  const orderObjectId = parseObjectId(input.orderId);
  if (!orderObjectId) return { ok: false, error: 'Unknown order.' };

  const conn = await getMongoConnection('live');
  const { Order, Restaurant } = getModels(conn);

  const order = await Order.findOne({ _id: orderObjectId }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.payment.status === 'succeeded') {
    return { ok: true, publicOrderId: order.publicOrderId, orderId: String(order._id) };
  }
  if (!order.payment.razorpayOrderId) {
    return { ok: false, error: 'Order has no Razorpay handshake.' };
  }

  const restaurant = await Restaurant.findById(order.restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  const razorpay = getRazorpayClientFromEncryptedKeys(restaurant, envelopeDecrypt);
  if (!razorpay) return { ok: false, error: 'Restaurant payments unavailable.' };

  const signatureValid = verifyRazorpayPaymentSignature({
    razorpayOrderId: order.payment.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpaySignature: input.razorpaySignature,
    keySecret: razorpay.keySecret,
  });

  if (!signatureValid) {
    await Order.updateOne(
      { restaurantId: order.restaurantId, _id: order._id },
      { $set: { 'payment.status': 'failed', 'payment.failureReason': 'signature_mismatch' } },
    ).exec();
    return { ok: false, error: 'Payment signature did not match. Please contact staff.' };
  }

  const now = new Date();
  await Order.updateOne(
    { restaurantId: order.restaurantId, _id: order._id },
    {
      $set: {
        'payment.status': 'succeeded',
        'payment.razorpayPaymentId': input.razorpayPaymentId,
        'payment.razorpaySignature': input.razorpaySignature,
        'payment.paidAt': now,
        status: 'confirmed',
      },
      $push: { statusHistory: { status: 'confirmed', at: now } },
    },
  ).exec();

  // Publish to the dashboard orders channel
  const restaurantId = String(order.restaurantId);
  const orderId = String(order._id);
  try {
    await publishRealtimeEvent(channels.orders(restaurantId), {
      type: 'order.created',
      orderId,
      channelId: 'kiosk',
      totalMinor: order.totalMinor,
      currency: order.currency,
      createdAt: now.toISOString(),
    });
  } catch (err) {
    captureException(err, { surface: 'kiosk:actions', message: 'ably publish failed' });
  }

  await enqueueWebhookEvent(conn, {
    restaurantId: order.restaurantId,
    eventType: 'order.created',
    data: {
      id: orderId,
      public_order_id: order.publicOrderId,
      channel: orderWebhookChannel('kiosk'),
      type: order.type,
      total_minor: order.totalMinor,
      currency: order.currency,
      status: 'confirmed',
    },
  });

  return { ok: true, publicOrderId: order.publicOrderId, orderId };
}

// Constant-time compare so we don't leak the PIN one digit at a time.
// Unconfigured KIOSK_EXIT_PIN always fails — no insecure default.
export async function verifyKioskPinAction(pin: string): Promise<{ ok: boolean }> {
  const expected = env.KIOSK_EXIT_PIN;
  if (!expected) return { ok: false };
  if (typeof pin !== 'string' || pin.length !== expected.length) return { ok: false };

  const expectedBytes = Buffer.from(expected, 'utf8');
  const providedBytes = Buffer.from(pin, 'utf8');
  if (providedBytes.length !== expectedBytes.length) return { ok: false };
  return { ok: timingSafeEqual(providedBytes, expectedBytes) };
}
