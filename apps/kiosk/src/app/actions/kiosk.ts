'use server';

import { timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { z } from 'zod';
import {
  buildMenuCommercePricing,
  enqueueWebhookEvent,
  envelopeDecrypt,
  generatePublicOrderId,
  getModels,
  getMongoConnection,
  reserveDailyPickupNumber,
  restaurantHasReachedOrderCapacity,
  upsertCustomerFromOrder,
} from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { captureException } from '@menukaze/monitoring';
import { channels } from '@menukaze/realtime';
import { loadTenantRestaurantFromHeaders } from '@menukaze/tenant/request';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import { formatMoney, orderWebhookChannel, parseCurrencyCode } from '@menukaze/shared';
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
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).max(99),
  modifiers: z.array(modifierInput).max(20),
  notes: z.string().max(500).optional(),
});

const kioskOrderInput = z.object({
  restaurantId: z.string().min(1),
  orderMode: z.enum(['dine_in', 'takeaway']),
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().min(7).max(40),
  customerEmail: z.string().email().max(320),
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
      customerPhone: string;
      customerEmail: string;
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

  const conn = await getMongoConnection('live');
  const { Restaurant, Order } = getModels(conn);

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

  const currency = parseCurrencyCode(restaurant.currency);
  const locale = restaurant.locale;
  const pricing = await buildMenuCommercePricing({
    connection: conn,
    restaurantId,
    restaurant,
    lines: input.lines,
    channel: 'kiosk',
  });
  if ('error' in pricing) return { ok: false, error: pricing.error };

  const minimumOrderMinor = restaurant.minimumOrderMinor ?? 0;
  if (minimumOrderMinor > 0 && pricing.subtotalMinor < minimumOrderMinor) {
    return {
      ok: false,
      error: `Minimum order is ${formatMoney(minimumOrderMinor, currency, locale)}.`,
    };
  }

  const { surchargeMinor, taxMinor } = pricing;
  const totalMinor = pricing.subtotalMinor + surchargeMinor;
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

  const prepMinutes = pricing.prepMinutes;
  const estimatedReadyAt = new Date(Date.now() + prepMinutes * 60_000);

  const order = await Order.create({
    restaurantId,
    publicOrderId,
    pickupNumber,
    channel: 'kiosk',
    type: input.orderMode === 'dine_in' ? 'dine_in' : 'pickup',
    customer: {
      name: input.customerName,
      phone: input.customerPhone,
      email: input.customerEmail,
    },
    items: pricing.snapshotLines,
    subtotalMinor: pricing.subtotalMinor,
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
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
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

  if (order.customer.phone) {
    await upsertCustomerFromOrder(conn, {
      restaurantId: order.restaurantId,
      phone: order.customer.phone,
      email: order.customer.email,
      name: order.customer.name,
      channel: 'kiosk',
      totalMinor: order.totalMinor,
      currency: order.currency,
    });
  }

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
// No configured PIN always fails — no insecure default.
export async function verifyKioskPinAction(pin: string): Promise<{ ok: boolean }> {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) return { ok: false };

  const restaurant = await loadTenantRestaurantFromHeaders(await headers());
  const expected = restaurant?.kioskPin;
  if (!expected) return { ok: false };
  if (pin.length !== expected.length) return { ok: false };

  const expectedBytes = Buffer.from(expected, 'utf8');
  const providedBytes = Buffer.from(pin, 'utf8');
  return { ok: timingSafeEqual(providedBytes, expectedBytes) };
}
