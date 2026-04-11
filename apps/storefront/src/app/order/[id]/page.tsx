import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { getMongoConnection, getModels } from '@menukaze/db';
import { formatMoney, type CurrencyCode } from '@menukaze/shared';
import { channels } from '@menukaze/realtime';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { OrderTracker } from './order-tracker';

export const dynamic = 'force-dynamic';

/**
 * Minimal confirmation page. Step 11 will promote this into a live tracking
 * experience via Ably; for Step 10 we only need a verifiable "order placed"
 * landing that proves the end-to-end flow worked.
 */
export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  const restaurant = await resolveTenantOrNotFound();
  const conn = await getMongoConnection('live');
  const { Order } = getModels(conn);

  const order = await Order.findOne({
    restaurantId: restaurant._id,
    _id: new Types.ObjectId(id),
  }).exec();
  if (!order) notFound();

  const currency = order.currency as CurrencyCode;
  const locale = restaurant.locale;
  const paid = order.payment.status === 'succeeded';

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

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Your order</h2>
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

        <OrderTracker
          restaurantId={String(restaurant._id)}
          orderId={String(order._id)}
          channelName={channels.customerOrder(String(restaurant._id), String(order._id))}
          initialStatus={order.status}
          initialPaymentStatus={order.payment.status}
        />
      </div>
    </main>
  );
}
