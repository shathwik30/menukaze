import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  buildMenuCommercePricing,
  enqueueWebhookEvent,
  generatePublicOrderId,
  getModels,
  getMongoConnection,
  reserveDailyPickupNumber,
  restaurantHasReachedOrderCapacity,
  upsertCustomerFromOrder,
} from '@menukaze/db';
import { parseObjectIds } from '@menukaze/db/object-id';
import { orderWebhookApiChannel } from '@menukaze/shared';
import { apiError, corsOptions, jsonOk, resolveApiKey, withApiCors } from '../_lib/auth';
import { withIdempotency } from '../_lib/idempotency';
import { rateLimitFor, rateLimitHeaders } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';

const modifierInput = z.object({
  group_name: z.string().min(1),
  option_name: z.string().min(1),
  price_minor: z.number().int().min(0),
});

const lineInput = z.object({
  item_id: z.string().min(1),
  variant_id: z.string().min(1).optional(),
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

export async function OPTIONS(request: NextRequest): Promise<Response> {
  return corsOptions(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  const ctx = await resolveApiKey(request, 'write');
  if (ctx instanceof Response) return ctx;

  const rl = await rateLimitFor(ctx, 'v1:orders:create');
  if (!rl.ok) {
    return withApiCors(
      request,
      apiError('rate_limit_exceeded', 'Rate limit exceeded. See Retry-After.', {
        headers: rateLimitHeaders(rl),
      }),
    );
  }
  const rateHeaders = rateLimitHeaders(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withApiCors(request, apiError('invalid_request', 'Body must be valid JSON.'));
  }

  const parsed = orderInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return withApiCors(
      request,
      apiError(
        'invalid_request',
        issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request body.',
      ),
    );
  }
  const input = parsed.data;
  if (input.items.length === 0) {
    return withApiCors(
      request,
      apiError('order_items_empty', 'The order must contain at least one item.'),
    );
  }

  const itemIds = parseObjectIds(input.items.map((l) => l.item_id));
  if (!itemIds) return withApiCors(request, apiError('invalid_request', 'Unknown item id.'));

  const conn = await getMongoConnection(ctx.dbName);
  return withApiCors(
    request,
    await withIdempotency({
      request,
      ctx,
      connection: conn,
      routeId: 'v1:orders:create',
      body: input,
      handler: async () => {
        const { Restaurant, Order } = getModels(conn);
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

        const pricing = await buildMenuCommercePricing({
          connection: conn,
          restaurantId: ctx.restaurantId,
          restaurant,
          lines: input.items.map((line) => ({
            itemId: line.item_id,
            variantId: line.variant_id,
            quantity: line.quantity,
            modifiers: line.modifiers.map((m) => ({
              groupName: m.group_name,
              optionName: m.option_name,
              priceMinor: m.price_minor,
            })),
            notes: line.notes,
          })),
          channel: 'api',
        });
        if ('error' in pricing) return apiError('item_unavailable', pricing.error);
        const minimumOrderMinor = restaurant.minimumOrderMinor ?? 0;
        if (minimumOrderMinor > 0 && pricing.subtotalMinor < minimumOrderMinor) {
          return apiError(
            'below_minimum_order',
            `Minimum order is ${minimumOrderMinor} (minor units).`,
          );
        }

        const { surchargeMinor, taxMinor } = pricing;
        const totalMinor = pricing.subtotalMinor + surchargeMinor;

        const publicOrderId = generatePublicOrderId();
        const pickupNumber = await reserveDailyPickupNumber(
          conn,
          ctx.restaurantId,
          restaurant.timezone,
        );
        const now = new Date();
        const prepMinutes = pricing.prepMinutes;
        const estimatedReadyAt = new Date(now.getTime() + prepMinutes * 60_000);

        const order = await Order.create({
          restaurantId: ctx.restaurantId,
          publicOrderId,
          pickupNumber,
          channel: 'api',
          apiKeyId: ctx.keyId,
          type: input.type,
          customer: input.customer,
          items: pricing.snapshotLines,
          subtotalMinor: pricing.subtotalMinor,
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

        if (input.customer.phone) {
          await upsertCustomerFromOrder(conn, {
            restaurantId: ctx.restaurantId,
            phone: input.customer.phone,
            email: input.customer.email,
            name: input.customer.name,
            channel: 'api',
            totalMinor,
            currency: restaurant.currency,
          });
        }

        await enqueueWebhookEvent(conn, {
          restaurantId: ctx.restaurantId,
          eventType: 'order.created',
          data: {
            id: String(order._id),
            public_order_id: publicOrderId,
            channel: orderWebhookApiChannel(ctx.channel.id, ctx.channel.name),
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
            subtotal_minor: pricing.subtotalMinor,
            tax_minor: taxMinor,
            total_minor: totalMinor,
            currency: restaurant.currency,
            estimated_ready_at: estimatedReadyAt.toISOString(),
          },
          { status: 201, headers: rateHeaders },
        );
      },
    }),
  );
}
