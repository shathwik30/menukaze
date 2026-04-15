import type { NextRequest } from 'next/server';
import { getModels, getMongoConnection } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { apiError, corsOptions, jsonOk, resolveApiKey } from '../../_lib/auth';
import { rateLimitFor, rateLimitHeaders } from '../../_lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function OPTIONS(): Promise<Response> {
  return corsOptions();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await resolveApiKey(request);
  if (ctx instanceof Response) return ctx;

  const rl = await rateLimitFor(ctx, 'v1:orders:get');
  if (!rl.ok) {
    return apiError('rate_limit_exceeded', 'Rate limit exceeded. See Retry-After.', {
      headers: rateLimitHeaders(rl),
    });
  }
  const rateHeaders = rateLimitHeaders(rl);

  const { id } = await params;
  const orderObjectId = parseObjectId(id);
  if (!orderObjectId) return apiError('not_found', 'Order not found.');

  const conn = await getMongoConnection('live');
  const { Order } = getModels(conn);
  const order = await Order.findOne({ restaurantId: ctx.restaurantId, _id: orderObjectId })
    .lean()
    .exec();
  if (!order) return apiError('not_found', 'Order not found.');

  return jsonOk(
    {
      id: String(order._id),
      public_order_id: order.publicOrderId,
      channel: { id: order.channel, type: order.channel === 'api' ? 'api' : 'built_in' },
      type: order.type,
      status: order.status,
      customer: {
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone ?? null,
      },
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price_minor: item.priceMinor,
        line_total_minor: item.lineTotalMinor,
        modifiers: item.modifiers.map((m) => ({
          group_name: m.groupName,
          option_name: m.optionName,
          price_minor: m.priceMinor,
        })),
        ...(item.notes ? { notes: item.notes } : {}),
        line_status: item.lineStatus ?? 'received',
      })),
      subtotal_minor: order.subtotalMinor,
      tax_minor: order.taxMinor,
      tip_minor: order.tipMinor,
      total_minor: order.totalMinor,
      currency: order.currency,
      payment: {
        gateway: order.payment.gateway,
        status: order.payment.status,
        paid_at: order.payment.paidAt ? order.payment.paidAt.toISOString() : null,
      },
      estimated_ready_at: order.estimatedReadyAt ? order.estimatedReadyAt.toISOString() : null,
      created_at: order.createdAt.toISOString(),
    },
    { headers: rateHeaders },
  );
}
