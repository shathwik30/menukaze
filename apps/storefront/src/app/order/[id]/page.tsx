import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { formatMoney, parseCurrencyCode } from '@menukaze/shared';
import { channels } from '@menukaze/realtime';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { TrackingArea } from './tracking-area';

export const dynamic = 'force-dynamic';

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderId = parseObjectId(id);
  if (!orderId) notFound();

  const restaurant = await resolveTenantOrNotFound();
  const conn = await getMongoConnection('live');
  const { Order } = getModels(conn);

  const { Feedback } = getModels(conn);
  const order = await Order.findOne({
    restaurantId: restaurant._id,
    _id: orderId,
  }).exec();
  if (!order) notFound();

  const currency = parseCurrencyCode(order.currency);
  const locale = restaurant.locale;
  const paid = order.payment.status === 'succeeded';
  // Fetch the feedback record regardless of current status — the widget may
  // surface live once the kitchen moves the order to ready without a refresh.
  const existingFeedback = await Feedback.findOne(
    { restaurantId: restaurant._id, orderId: order._id },
    { _id: 1 },
  )
    .lean()
    .exec();

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <div className="border-border rounded-lg border p-6">
        <h1 className="text-2xl font-bold">{paid ? 'Order confirmed' : 'Order received'}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reference: <span className="text-foreground font-mono">{order.publicOrderId}</span>
        </p>
        <p className="text-muted-foreground mt-4 text-sm">
          Thanks {order.customer.name.split(' ')[0]}! We&apos;ve sent a confirmation to{' '}
          <span className="text-foreground">{order.customer.email}</span>.
        </p>

        {order.estimatedReadyAt ? (
          <p className="text-foreground mt-3 text-sm">
            Estimated ready by{' '}
            <span className="font-semibold">
              {new Date(order.estimatedReadyAt).toLocaleTimeString(locale, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            .
          </p>
        ) : null}

        <section className="mt-6">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Your order</h2>
          <ul className="divide-border mt-2 divide-y">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-4 py-2 text-sm">
                <span>
                  <span className="text-foreground font-medium">
                    {item.quantity}× {item.name}
                  </span>
                  {item.modifiers.length > 0 ? (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {item.modifiers.map((m) => m.optionName).join(', ')}
                    </span>
                  ) : null}
                </span>
                <span className="text-foreground font-mono text-sm">
                  {formatMoney(item.lineTotalMinor, currency, locale)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-border mt-3 flex items-center justify-between border-t pt-3 text-sm">
            <span className="font-semibold">Total</span>
            <span className="font-mono font-semibold">
              {formatMoney(order.totalMinor, currency, locale)}
            </span>
          </div>
        </section>

        <TrackingArea
          restaurantId={String(restaurant._id)}
          orderId={String(order._id)}
          channelName={channels.customerOrder(String(restaurant._id), String(order._id))}
          initialStatus={order.status}
          initialPaymentStatus={order.payment.status}
          alreadySubmittedFeedback={Boolean(existingFeedback)}
        />
      </div>
    </main>
  );
}
