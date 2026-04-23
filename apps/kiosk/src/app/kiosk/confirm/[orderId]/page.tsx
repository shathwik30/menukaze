import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { formatMoney, parseCurrencyCode } from '@menukaze/shared';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { ConfirmClient } from './confirm-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ orderId: string }>;
}

export default async function KioskConfirmPage({ params }: PageProps) {
  const { orderId } = await params;
  const restaurant = await resolveTenantOrNotFound();

  const orderObjectId = parseObjectId(orderId);
  if (!orderObjectId) notFound();

  const conn = await getMongoConnection('live');
  const { Order } = getModels(conn);
  const order = await Order.findOne({ restaurantId: restaurant._id, _id: orderObjectId }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!order) notFound();

  const currency = parseCurrencyCode(restaurant.currency);
  const locale = restaurant.locale;
  const totalLabel = formatMoney(order.totalMinor, currency, locale);
  const readyTimeLabel = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(order.estimatedReadyAt);

  const itemLines = order.items.map((i: { name: string; quantity: number }) => ({
    name: i.name,
    quantity: i.quantity,
  }));

  return (
    <ConfirmClient
      restaurantId={String(restaurant._id)}
      orderId={orderId}
      publicOrderId={order.publicOrderId}
      {...(typeof order.pickupNumber === 'number' ? { pickupNumber: order.pickupNumber } : {})}
      initialStatus={order.status}
      customerName={order.customer.name}
      totalLabel={totalLabel}
      itemLines={itemLines}
      estimatedPrepMinutes={restaurant.estimatedPrepMinutes ?? 20}
      readyTimeLabel={readyTimeLabel}
      orderTypeLabel={order.type === 'dine_in' ? 'Dine in' : 'Takeaway'}
      paid={order.payment.status === 'succeeded'}
    />
  );
}
