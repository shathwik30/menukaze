import type { NextRequest } from 'next/server';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  enqueueWebhookEvent,
  generatePublicOrderId,
  getModels,
  getMongoConnection,
  restaurantHasReachedOrderCapacity,
  upsertCustomerFromOrder,
} from '@menukaze/db';
import { parseObjectIds } from '@menukaze/db/object-id';
import { computeTax, resolvePrimaryStationId, validateModifierSelection } from '@menukaze/shared';
import { apiError, corsOptions, jsonOk, resolveApiKey } from '../_lib/auth';
import { rateLimitFor, rateLimitHeaders } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';

const modifierInput = z.object({
  group_name: z.string().min(1),
  option_name: z.string().min(1),
  price_minor: z.number().int().min(0),
});

const lineInput = z.object({
  item_id: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  modifiers: z.array(modifierInput).max(20).default([]),
  notes: z.string().max(500).optional(),
});

const orderInput = z.object({
  type: z.enum(['pickup', 'delivery', 'dine_in']).default('pickup'),
  customer: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(320),
    phone: z.string().min(7).max(40).optional(),
  }),
  items: z.array(lineInput).min(1).max(50),
});

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

export async function OPTIONS(): Promise<Response> {
  return corsOptions();
}

export async function POST(request: NextRequest): Promise<Response> {
  const ctx = await resolveApiKey(request, 'write');
  if (ctx instanceof Response) return ctx;

  const rl = await rateLimitFor(ctx, 'v1:orders:create');
  if (!rl.ok) {
    return apiError('rate_limit_exceeded', 'Rate limit exceeded. See Retry-After.', {
      headers: rateLimitHeaders(rl),
    });
  }
  const rateHeaders = rateLimitHeaders(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be valid JSON.');
  }

  const parsed = orderInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return apiError(
      'invalid_request',
      issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request body.',
    );
  }
  const input = parsed.data;
  if (input.items.length === 0) {
    return apiError('order_items_empty', 'The order must contain at least one item.');
  }

  const itemIds = parseObjectIds(input.items.map((l) => l.item_id));
  if (!itemIds) return apiError('invalid_request', 'Unknown item id.');

  const conn = await getMongoConnection('live');
  const { Restaurant, Item, Order, Category } = getModels(conn);
  const restaurant = await Restaurant.findById(ctx.restaurantId).exec();
  if (!restaurant) return apiError('not_found', 'Restaurant not found.');
  if (!restaurant.liveAt) {
    return apiError('restaurant_closed', 'Restaurant is not accepting orders yet.');
  }
  if (restaurant.holidayMode?.enabled) {
    return apiError(
      'restaurant_closed',
      restaurant.holidayMode.message ?? 'Restaurant is currently closed.',
    );
  }
  if (restaurant.throttling?.enabled) {
    const atCapacity = await restaurantHasReachedOrderCapacity(
      conn,
      ctx.restaurantId,
      restaurant.throttling.maxConcurrentOrders,
    );
    if (atCapacity) return apiError('service_unavailable', 'Kitchen is at capacity.');
  }

  const items = await Item.find({ restaurantId: ctx.restaurantId, _id: { $in: itemIds } }).exec();
  const itemsById = new Map(items.map((item) => [String(item._id), item]));
  const categoryIds = Array.from(new Set(items.map((item) => String(item.categoryId))));
  const categories =
    categoryIds.length > 0
      ? await Category.find(
          { restaurantId: ctx.restaurantId, _id: { $in: categoryIds } },
          { stationIds: 1 },
        )
          .lean()
          .exec()
      : [];
  const categoryStationsById = new Map(categories.map((c) => [String(c._id), c.stationIds ?? []]));

  const snapshotLines: SnapshotLine[] = [];
  let subtotalMinor = 0;
  for (const line of input.items) {
    const item = itemsById.get(line.item_id);
    if (!item) return apiError('item_unavailable', 'Item no longer available.');
    if (item.soldOut) return apiError('item_unavailable', `${item.name} is sold out.`);
    if (item.currency !== restaurant.currency) {
      return apiError('invalid_request', `Currency mismatch for ${item.name}.`);
    }

    const modResult = validateModifierSelection(
      item.modifiers,
      line.modifiers.map((m) => ({
        groupName: m.group_name,
        optionName: m.option_name,
        priceMinor: m.price_minor,
      })),
      item.name,
    );
    if (!modResult.ok) return apiError('invalid_request', modResult.error);
    const unitMinor = item.priceMinor + modResult.modifiers.reduce((s, m) => s + m.priceMinor, 0);
    const lineTotalMinor = unitMinor * line.quantity;
    subtotalMinor += lineTotalMinor;

    const stationId = resolvePrimaryStationId(
      item.stationIds ?? null,
      categoryStationsById.get(String(item.categoryId)) ?? null,
    );

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

  if (subtotalMinor <= 0) {
    return apiError('order_items_empty', 'Order has no items.');
  }
  const minimumOrderMinor = restaurant.minimumOrderMinor ?? 0;
  if (minimumOrderMinor > 0 && subtotalMinor < minimumOrderMinor) {
    return apiError('below_minimum_order', `Minimum order is ${minimumOrderMinor} (minor units).`);
  }

  const { surchargeMinor, taxMinor } = computeTax(subtotalMinor, restaurant.taxRules ?? []);
  const totalMinor = subtotalMinor + surchargeMinor;

  const publicOrderId = generatePublicOrderId();
  const now = new Date();
  const prepMinutes = restaurant.estimatedPrepMinutes ?? 20;
  const estimatedReadyAt = new Date(now.getTime() + prepMinutes * 60_000);

  const order = await Order.create({
    restaurantId: ctx.restaurantId,
    publicOrderId,
    channel: 'api',
    type: input.type,
    customer: input.customer,
    items: snapshotLines,
    subtotalMinor,
    taxMinor,
    tipMinor: 0,
    totalMinor,
    currency: restaurant.currency,
    status: 'received',
    statusHistory: [{ status: 'received', at: now }],
    estimatedReadyAt,
    payment: {
      gateway: 'cash',
      status: 'pending',
      amountMinor: totalMinor,
      currency: restaurant.currency,
      methodLabel: 'API integration (collect at counter)',
    },
  });

  await upsertCustomerFromOrder(conn, {
    restaurantId: ctx.restaurantId,
    email: input.customer.email,
    name: input.customer.name,
    ...(input.customer.phone ? { phone: input.customer.phone } : {}),
    channel: 'api',
    totalMinor,
    currency: restaurant.currency,
  });

  await enqueueWebhookEvent(conn, {
    restaurantId: ctx.restaurantId,
    eventType: 'order.created',
    data: {
      id: String(order._id),
      public_order_id: publicOrderId,
      channel: { id: ctx.channel.id, name: ctx.channel.name, type: 'api' },
      type: input.type,
      total_minor: totalMinor,
      currency: restaurant.currency,
      status: 'received',
    },
  });

  return jsonOk(
    {
      id: String(order._id),
      public_order_id: publicOrderId,
      channel: ctx.channel,
      type: input.type,
      status: 'received',
      subtotal_minor: subtotalMinor,
      tax_minor: taxMinor,
      total_minor: totalMinor,
      currency: restaurant.currency,
      estimated_ready_at: estimatedReadyAt.toISOString(),
    },
    { status: 201, headers: rateHeaders },
  );
}
