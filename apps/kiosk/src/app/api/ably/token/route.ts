import { NextResponse, type NextRequest } from 'next/server';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { channels } from '@menukaze/realtime';
import { createAblyTokenRequest } from '@menukaze/realtime/server';
import { resolveTenantOrNotFound } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/**
 * Mints a short-lived Ably token scoped to one kiosk order channel.
 * Called by the confirm screen's Ably client to track order status.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const orderId = request.nextUrl.searchParams.get('orderId');
  const orderObjectId = orderId ? parseObjectId(orderId) : null;
  if (!orderObjectId || !orderId) {
    return NextResponse.json({ error: 'Missing or invalid orderId' }, { status: 400 });
  }

  const restaurant = await resolveTenantOrNotFound();
  const conn = await getMongoConnection('live');
  const { Order } = getModels(conn);

  const order = await Order.findOne({ restaurantId: restaurant._id, _id: orderObjectId }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const channel = channels.customerOrder(String(restaurant._id), orderId);
  const tokenRequest = await createAblyTokenRequest({ [channel]: ['subscribe'] });
  return NextResponse.json(tokenRequest);
}
