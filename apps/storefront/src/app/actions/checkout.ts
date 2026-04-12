'use server';

import { createHmac } from 'node:crypto';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  envelopeDecrypt,
  getMongoConnection,
  getModels,
  generatePublicOrderId,
  restaurantHasReachedOrderCapacity,
} from '@menukaze/db';
import { parseObjectId, parseObjectIds } from '@menukaze/db/object-id';
import { channels } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import {
  computeTax,
  formatMoney,
  parseCurrencyCode,
  validateModifierSelection,
} from '@menukaze/shared';
import { getRazorpayClientFromEncryptedKeys } from '@menukaze/shared/razorpay';
import { sendTransactionalEmail } from '@menukaze/shared/transactional-email';
import { getZodErrorMessage } from '@menukaze/shared/validation';
import { OrderConfirmationEmail } from '@/emails/order-confirmation';
import { OrderReceiptEmail } from '@/emails/order-receipt';

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

const checkoutInput = z.object({
  restaurantId: z.string().min(1),
  type: z.enum(['pickup', 'delivery']),
  customer: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(320),
    phone: z.string().max(40).optional(),
  }),
  lines: z.array(lineInput).min(1).max(50),
});

export type CheckoutInput = z.infer<typeof checkoutInput>;

function readRazorpayOrderId(order: { id?: unknown }): string {
  if (typeof order.id !== 'string' || order.id.length === 0) {
    throw new Error('Razorpay did not return an order id.');
  }
  return order.id;
}

export type CreatePaymentIntentResult =
  | {
      ok: true;
      orderId: string;
      publicOrderId: string;
      razorpayOrderId: string;
      razorpayKeyId: string;
      amountMinor: number;
      currency: string;
      customer: { name: string; email: string; phone?: string };
    }
  | { ok: false; error: string };

interface CheckoutLineSnapshot {
  itemId: Types.ObjectId;
  name: string;
  priceMinor: number;
  quantity: number;
  modifiers: { groupName: string; optionName: string; priceMinor: number }[];
  notes?: string;
  lineTotalMinor: number;
}

interface CheckoutRestaurant {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  currency: string;
  locale: string;
  razorpayKeyIdEnc?: string | null;
  razorpayKeySecretEnc?: string | null;
  liveAt?: Date | null;
  holidayMode?: { enabled?: boolean; message?: string } | null;
  throttling?: { enabled?: boolean; maxConcurrentOrders: number } | null;
  minimumOrderMinor?: number | null;
  deliveryFeeMinor?: number | null;
  estimatedPrepMinutes?: number | null;
  taxRules?: Array<{
    name: string;
    percent: number;
    inclusive: boolean;
    scope: 'order' | 'item';
    label?: string;
  }> | null;
}

interface CheckoutOrderRecord {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  publicOrderId: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  customer: { name: string; email: string; phone?: string };
  items: Array<{
    name: string;
    quantity: number;
    lineTotalMinor: number;
    modifiers: Array<{ optionName: string }>;
  }>;
  payment: {
    status: string;
    razorpayOrderId?: string | null;
  };
}

interface CheckoutPricing {
  snapshotLines: CheckoutLineSnapshot[];
  subtotalMinor: number;
}

function buildCheckoutIds(
  input: CheckoutInput,
): { restaurantId: Types.ObjectId; itemIds: Types.ObjectId[] } | { error: string } {
  const restaurantId = parseObjectId(input.restaurantId);
  if (!restaurantId) {
    return { error: 'Unknown restaurant.' };
  }

  const itemIds = parseObjectIds(input.lines.map((line) => line.itemId));
  if (!itemIds) {
    return { error: 'Unknown item.' };
  }

  return { restaurantId, itemIds };
}

async function ensureRestaurantCanCheckout(
  conn: Awaited<ReturnType<typeof getMongoConnection>>,
  restaurantId: Types.ObjectId,
): Promise<{ restaurant: CheckoutRestaurant } | { error: string }> {
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { error: 'Restaurant not found.' };
  if (!restaurant.liveAt) {
    return { error: 'This restaurant is not accepting orders yet.' };
  }

  if (restaurant.throttling?.enabled) {
    const atCapacity = await restaurantHasReachedOrderCapacity(
      conn,
      restaurantId,
      restaurant.throttling.maxConcurrentOrders,
    );
    if (atCapacity) {
      return {
        error: 'The kitchen is running at capacity right now. Please try again in a few minutes.',
      };
    }
  }

  return { restaurant };
}

async function buildCheckoutPricing(
  itemModel: ReturnType<typeof getModels>['Item'],
  restaurantId: Types.ObjectId,
  itemIds: Types.ObjectId[],
  restaurant: CheckoutRestaurant,
  lines: CheckoutInput['lines'],
): Promise<CheckoutPricing | { error: string }> {
  const items = await itemModel.find({ restaurantId, _id: { $in: itemIds } }).exec();
  const itemsById = new Map(items.map((item) => [String(item._id), item]));

  const snapshotLines: CheckoutLineSnapshot[] = [];
  let subtotalMinor = 0;

  for (const line of lines) {
    const item = itemsById.get(line.itemId);
    if (!item) return { error: 'Item no longer available.' };
    if (item.soldOut) return { error: `${item.name} is sold out.` };
    if (item.currency !== restaurant.currency) {
      return { error: `Currency mismatch for ${item.name}.` };
    }

    const modifierResult = validateModifierSelection(item.modifiers, line.modifiers, item.name);
    if (!modifierResult.ok) {
      return { error: modifierResult.error };
    }

    const resolvedModifiers = modifierResult.modifiers;
    const unitMinor =
      item.priceMinor + resolvedModifiers.reduce((sum, modifier) => sum + modifier.priceMinor, 0);
    const lineTotalMinor = unitMinor * line.quantity;
    subtotalMinor += lineTotalMinor;

    snapshotLines.push({
      itemId: item._id,
      name: item.name,
      priceMinor: item.priceMinor,
      quantity: line.quantity,
      modifiers: resolvedModifiers,
      ...(line.notes ? { notes: line.notes } : {}),
      lineTotalMinor,
    });
  }

  if (subtotalMinor <= 0) {
    return { error: 'Your cart is empty.' };
  }

  if (restaurant.holidayMode?.enabled) {
    return {
      error: restaurant.holidayMode.message ?? 'The restaurant is currently closed.',
    };
  }

  const minimumOrderMinor = restaurant.minimumOrderMinor ?? 0;
  if (minimumOrderMinor > 0 && subtotalMinor < minimumOrderMinor) {
    return {
      error: `Minimum order is ${formatMoney(
        minimumOrderMinor,
        parseCurrencyCode(restaurant.currency),
        restaurant.locale,
      )}.`,
    };
  }

  return { snapshotLines, subtotalMinor };
}

function buildTrackingUrl(restaurant: CheckoutRestaurant, orderId: string): string {
  const baseHost = process.env['NEXT_PUBLIC_STOREFRONT_HOST'] ?? `${restaurant.slug}.menukaze.dev`;
  const scheme = baseHost.includes('localhost') ? 'http' : 'https';
  return `${scheme}://${baseHost}/order/${orderId}`;
}

function buildEmailLines(order: CheckoutOrderRecord, restaurant: CheckoutRestaurant) {
  const currency = parseCurrencyCode(order.currency);
  const locale = restaurant.locale;

  return {
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      lineTotalLabel: formatMoney(item.lineTotalMinor, currency, locale),
    })),
    locale,
    subtotalLabel: formatMoney(order.subtotalMinor, currency, locale),
    taxLabel: formatMoney(order.taxMinor, currency, locale),
    totalLabel: formatMoney(order.totalMinor, currency, locale),
  };
}

async function publishCheckoutConfirmation(
  order: CheckoutOrderRecord,
  changedAt: Date,
): Promise<void> {
  const restaurantId = String(order.restaurantId);
  const orderId = String(order._id);

  try {
    await Promise.all([
      publishRealtimeEvent(channels.customerOrder(restaurantId, orderId), {
        type: 'order.status_changed',
        orderId,
        status: 'confirmed',
        changedAt: changedAt.toISOString(),
      }),
      publishRealtimeEvent(channels.orders(restaurantId), {
        type: 'order.created',
        orderId,
        channelId: 'storefront',
        totalMinor: order.totalMinor,
        currency: order.currency,
        createdAt: changedAt.toISOString(),
      }),
    ]);
  } catch (error) {
    console.warn('[checkout] ably publish failed', error);
  }
}

async function sendCheckoutEmails(
  order: CheckoutOrderRecord,
  restaurant: CheckoutRestaurant,
  paidAt: Date,
): Promise<void> {
  try {
    const lines = buildEmailLines(order, restaurant);
    const trackingUrl = buildTrackingUrl(restaurant, String(order._id));

    await sendTransactionalEmail({
      to: order.customer.email,
      subject: `Order ${order.publicOrderId} confirmed · ${restaurant.name}`,
      react: OrderConfirmationEmail({
        restaurantName: restaurant.name,
        customerName: order.customer.name,
        publicOrderId: order.publicOrderId,
        trackingUrl,
        items: lines.items,
        totalLabel: lines.totalLabel,
      }),
    });

    await sendTransactionalEmail({
      to: order.customer.email,
      subject: `Receipt · ${order.publicOrderId}`,
      react: OrderReceiptEmail({
        restaurantName: restaurant.name,
        publicOrderId: order.publicOrderId,
        paidAt: paidAt.toLocaleString(lines.locale, { dateStyle: 'medium', timeStyle: 'short' }),
        items: lines.items,
        subtotalLabel: lines.subtotalLabel,
        taxLabel: lines.taxLabel,
        totalLabel: lines.totalLabel,
        paymentMethodLabel: 'Razorpay (test mode)',
      }),
    });
  } catch (error) {
    console.warn('[checkout] email send failed', error);
  }
}

/**
 * Rebuild pricing from the database, create the pending order, and return
 * the Razorpay payload the client needs to open Checkout.js.
 */
export async function createPaymentIntentAction(raw: unknown): Promise<CreatePaymentIntentResult> {
  const parsed = checkoutInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: getZodErrorMessage(parsed.error, 'Invalid checkout data.') };
  }
  const input = parsed.data;

  const checkoutIds = buildCheckoutIds(input);
  if ('error' in checkoutIds) {
    return { ok: false, error: checkoutIds.error };
  }

  const conn = await getMongoConnection('live');
  const { Item, Order } = getModels(conn);
  const restaurantResult = await ensureRestaurantCanCheckout(conn, checkoutIds.restaurantId);
  if ('error' in restaurantResult) {
    return { ok: false, error: restaurantResult.error };
  }
  const restaurant = restaurantResult.restaurant;

  const pricing = await buildCheckoutPricing(
    Item,
    checkoutIds.restaurantId,
    checkoutIds.itemIds,
    restaurant,
    input.lines,
  );
  if ('error' in pricing) {
    return { ok: false, error: pricing.error };
  }

  const deliveryFeeMinor = input.type === 'delivery' ? (restaurant.deliveryFeeMinor ?? 0) : 0;
  const { taxMinor, surchargeMinor } = computeTax(pricing.subtotalMinor, restaurant.taxRules ?? []);
  const totalMinor = pricing.subtotalMinor + surchargeMinor + deliveryFeeMinor;
  if (totalMinor <= 0) {
    return { ok: false, error: 'Your cart is empty.' };
  }

  const razorpay = getRazorpayClientFromEncryptedKeys(restaurant, envelopeDecrypt);
  if (!razorpay) {
    return {
      ok: false,
      error: 'This restaurant has not finished setting up payments. Please try again later.',
    };
  }

  const prepMinutes = restaurant.estimatedPrepMinutes ?? 20;
  const estimatedReadyAt = new Date(Date.now() + prepMinutes * 60_000);
  const publicOrderId = generatePublicOrderId();

  const razorpayOrder = await razorpay.client.orders.create({
    amount: totalMinor,
    currency: restaurant.currency,
    receipt: publicOrderId,
    notes: {
      restaurantId: String(checkoutIds.restaurantId),
      publicOrderId,
      channel: 'storefront',
    },
  });
  const razorpayOrderId = readRazorpayOrderId(razorpayOrder);

  const order = await Order.create({
    restaurantId: checkoutIds.restaurantId,
    publicOrderId,
    channel: 'storefront',
    type: input.type === 'pickup' ? 'pickup' : 'delivery',
    customer: input.customer,
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
    customer: input.customer,
  };
}

const verifyInput = z.object({
  orderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export type VerifyPaymentResult =
  | { ok: true; publicOrderId: string }
  | { ok: false; error: string };

/**
 * Verify the Razorpay signature, mark the order paid, and trigger the
 * follow-up side effects.
 */
export async function verifyPaymentAction(raw: unknown): Promise<VerifyPaymentResult> {
  const parsed = verifyInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: getZodErrorMessage(parsed.error, 'Invalid verification payload.') };
  }
  const input = parsed.data;

  const orderObjectId = parseObjectId(input.orderId);
  if (!orderObjectId) {
    return { ok: false, error: 'Unknown order.' };
  }

  const conn = await getMongoConnection('live');
  const { Order, Restaurant } = getModels(conn);

  const order = await Order.findOne({ _id: orderObjectId }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.payment.status === 'succeeded') {
    return { ok: true, publicOrderId: order.publicOrderId };
  }
  if (!order.payment.razorpayOrderId) {
    return { ok: false, error: 'Order has no Razorpay handshake.' };
  }

  const restaurant = await Restaurant.findById(order.restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  const razorpay = getRazorpayClientFromEncryptedKeys(restaurant, envelopeDecrypt);
  if (!razorpay) return { ok: false, error: 'Restaurant payments unavailable.' };

  const expected = createHmac('sha256', razorpay.keySecret)
    .update(`${order.payment.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest('hex');
  if (expected !== input.razorpaySignature) {
    await Order.updateOne(
      { restaurantId: order.restaurantId, _id: order._id },
      {
        $set: {
          'payment.status': 'failed',
          'payment.failureReason': 'signature_mismatch',
        },
      },
    ).exec();
    return { ok: false, error: 'Payment signature did not match. Please contact support.' };
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

  await publishCheckoutConfirmation(order as CheckoutOrderRecord, now);
  await sendCheckoutEmails(order as CheckoutOrderRecord, restaurant as CheckoutRestaurant, now);

  return { ok: true, publicOrderId: order.publicOrderId };
}
