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

/**
 * Phase 1 of checkout — validate the cart against current menu state, create
 * the Order document in `payment.status = pending`, then create a matching
 * Razorpay order via the merchant's decrypted credentials. Returns the
 * handshake payload the client needs to open Razorpay Checkout.js.
 *
 * Prices are **always recomputed from the DB**. The client's cart lines are
 * used only for `(itemId, quantity, modifier selections)` — never for the
 * `priceMinor` values.
 */
export async function createPaymentIntentAction(raw: unknown): Promise<CreatePaymentIntentResult> {
  const parsed = checkoutInput.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Invalid checkout data.',
    };
  }
  const input = parsed.data;

  if (!Types.ObjectId.isValid(input.restaurantId)) {
    return { ok: false, error: 'Unknown restaurant.' };
  }
  const restaurantId = new Types.ObjectId(input.restaurantId);
  for (const line of input.lines) {
    if (!Types.ObjectId.isValid(line.itemId)) {
      return { ok: false, error: `Unknown item: ${line.itemId}` };
    }
  }

  const conn = await getMongoConnection('live');
  const { Restaurant, Item, Order } = getModels(conn);

  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };
  if (!restaurant.liveAt) {
    return { ok: false, error: 'This restaurant is not accepting orders yet.' };
  }

  const razorpay = getRazorpayClient(restaurant);
  if (!razorpay) {
    return {
      ok: false,
      error: 'This restaurant has not finished setting up payments. Please try again later.',
    };
  }

  const itemIds = input.lines.map((l) => new Types.ObjectId(l.itemId));
  const items = await Item.find({
    restaurantId,
    _id: { $in: itemIds },
  }).exec();

  const itemsById = new Map(items.map((item) => [String(item._id), item]));

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

  for (const line of input.lines) {
    const item = itemsById.get(line.itemId);
    if (!item) return { ok: false, error: `Item no longer available.` };
    if (item.soldOut) return { ok: false, error: `${item.name} is sold out.` };
    if (item.currency !== restaurant.currency) {
      return { ok: false, error: `Currency mismatch for ${item.name}.` };
    }

    // Re-resolve every modifier option against the canonical item doc so
    // the client can't inject a zero-priced "Double Patty".
    const resolvedMods: { groupName: string; optionName: string; priceMinor: number }[] = [];
    for (const mod of line.modifiers) {
      const group = item.modifiers.find((g) => g.name === mod.groupName);
      const option = group?.options.find((o) => o.name === mod.optionName);
      if (!group || !option) {
        return { ok: false, error: `Invalid modifier for ${item.name}.` };
      }
      resolvedMods.push({
        groupName: group.name,
        optionName: option.name,
        priceMinor: option.priceMinor,
      });
    }

    const unitMinor = item.priceMinor + resolvedMods.reduce((sum, m) => sum + m.priceMinor, 0);
    const lineTotalMinor = unitMinor * line.quantity;
    subtotalMinor += lineTotalMinor;

    snapshotLines.push({
      itemId: item._id,
      name: item.name,
      priceMinor: item.priceMinor,
      quantity: line.quantity,
      modifiers: resolvedMods,
      ...(line.notes ? { notes: line.notes } : {}),
      lineTotalMinor,
    });
  }

  if (subtotalMinor <= 0) {
    return { ok: false, error: 'Your cart is empty.' };
  }

  // Settings-driven gates from Step 17 — holiday mode, minimum order value,
  // flat delivery fee. Tax rules and zone-based delivery fees are still
  // deferred per §20's MVP cut.
  if (restaurant.holidayMode?.enabled) {
    return {
      ok: false,
      error: restaurant.holidayMode.message ?? 'The restaurant is currently closed.',
    };
  }
  const minOrder = restaurant.minimumOrderMinor ?? 0;
  if (minOrder > 0 && subtotalMinor < minOrder) {
    return {
      ok: false,
      error: `Minimum order is ${formatMoney(minOrder, restaurant.currency as CurrencyCode, restaurant.locale)}.`,
    };
  }

  const deliveryFeeMinor = input.type === 'delivery' ? (restaurant.deliveryFeeMinor ?? 0) : 0;
  const totalMinor = subtotalMinor + deliveryFeeMinor;

  const prepMinutes = restaurant.estimatedPrepMinutes ?? 20;
  const estimatedReadyAt = new Date(Date.now() + prepMinutes * 60_000);
  const publicOrderId = generatePublicOrderId();

  // Razorpay order ids need a receipt string ≤40 chars that uniquely ids
  // the order on the merchant's side — public order id fits.
  const razorpayOrder = await razorpay.client.orders.create({
    amount: totalMinor,
    currency: restaurant.currency,
    receipt: publicOrderId,
    notes: {
      restaurantId: String(restaurantId),
      publicOrderId,
      channel: 'storefront',
    },
  });
  const razorpayOrderId = razorpayOrder.id as string;

  const order = await Order.create({
    restaurantId,
    publicOrderId,
    channel: 'storefront',
    type: input.type === 'pickup' ? 'pickup' : 'delivery',
    customer: input.customer,
    items: snapshotLines,
    subtotalMinor,
    taxMinor: 0,
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
 * Phase 2 of checkout — verify the HMAC returned by Razorpay Checkout.js and
 * mark the payment (and order) succeeded. The signature is
 *   HMAC_SHA256(razorpayOrderId + "|" + razorpayPaymentId, key_secret)
 * and must match the `razorpay_signature` field the client returns.
 *
 * Runs server-side because `key_secret` must never be shipped to the browser.
 */
export async function verifyPaymentAction(raw: unknown): Promise<VerifyPaymentResult> {
  const parsed = verifyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid verification payload.' };
  const input = parsed.data;

  if (!Types.ObjectId.isValid(input.orderId)) {
    return { ok: false, error: 'Unknown order.' };
  }
  const orderObjectId = new Types.ObjectId(input.orderId);

  const conn = await getMongoConnection('live');
  const { Order, Restaurant } = getModels(conn);

  // Cross-tenant lookup by _id alone would trip the tenant guard, so we pull
  // the order first with skipTenantGuard, then use its restaurantId for
  // every follow-up write.
  const order = await Order.findOne({ _id: orderObjectId }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.payment.status === 'succeeded') {
    // Idempotent — client may retry. Treat as success.
    return { ok: true, publicOrderId: order.publicOrderId };
  }
  if (!order.payment.razorpayOrderId) {
    return { ok: false, error: 'Order has no Razorpay handshake.' };
  }

  const restaurant = await Restaurant.findById(order.restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  const razorpay = getRazorpayClient(restaurant);
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

  // Best-effort realtime fan-out to the customer tracking page + the
  // dashboard orders feed. A publish failure must not reject the whole
  // payment verification — the DB write is already committed.
  const restaurantIdStr = String(order.restaurantId);
  const orderIdStr = String(order._id);
  try {
    await Promise.all([
      publishRealtimeEvent(channels.customerOrder(restaurantIdStr, orderIdStr), {
        type: 'order.status_changed',
        orderId: orderIdStr,
        status: 'confirmed',
        changedAt: now.toISOString(),
      }),
      publishRealtimeEvent(channels.orders(restaurantIdStr), {
        type: 'order.created',
        orderId: orderIdStr,
        channelId: 'storefront',
        totalMinor: order.totalMinor,
        currency: order.currency,
        createdAt: now.toISOString(),
      }),
    ]);
  } catch (error) {
    console.warn('[checkout] ably publish failed', error);
  }

  // Best-effort transactional emails — confirmation + receipt. Also fire
  // and do not reject the verification if Resend is down.
  try {
    const currency = order.currency as CurrencyCode;
    const locale = restaurant.locale;
    const baseHost =
      process.env['NEXT_PUBLIC_STOREFRONT_HOST'] ?? `${restaurant.slug}.menukaze.dev`;
    const scheme = baseHost.includes('localhost') ? 'http' : 'https';
    const trackingUrl = `${scheme}://${baseHost}/order/${orderIdStr}`;

    const items = order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      lineTotalLabel: formatMoney(item.lineTotalMinor, currency, locale),
    }));

    await sendTransactionalEmail({
      to: order.customer.email,
      subject: `Order ${order.publicOrderId} confirmed · ${restaurant.name}`,
      react: OrderConfirmationEmail({
        restaurantName: restaurant.name,
        customerName: order.customer.name,
        publicOrderId: order.publicOrderId,
        trackingUrl,
        items,
        totalLabel: formatMoney(order.totalMinor, currency, locale),
      }),
    });

    await sendTransactionalEmail({
      to: order.customer.email,
      subject: `Receipt · ${order.publicOrderId}`,
      react: OrderReceiptEmail({
        restaurantName: restaurant.name,
        publicOrderId: order.publicOrderId,
        paidAt: now.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }),
        items,
        subtotalLabel: formatMoney(order.subtotalMinor, currency, locale),
        taxLabel: formatMoney(order.taxMinor, currency, locale),
        totalLabel: formatMoney(order.totalMinor, currency, locale),
        paymentMethodLabel: 'Razorpay (test mode)',
      }),
    });
  } catch (error) {
    console.warn('[checkout] email send failed', error);
  }

  return { ok: true, publicOrderId: order.publicOrderId };
}
