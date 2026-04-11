import { Types } from 'mongoose';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { formatMoney, type CurrencyCode } from '@menukaze/shared';
import { requireOnboarded } from '@/lib/session';
import { OrderStatusControl } from './order-status-control';

export const dynamic = 'force-dynamic';

export default async function DashboardOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);
  const conn = await getMongoConnection('live');
  const { Restaurant, Order } = getModels(conn);

  const [restaurant, order] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Order.findOne({ restaurantId, _id: new Types.ObjectId(id) })
      .lean()
      .exec(),
  ]);
  if (!order) notFound();

  const currency = (restaurant?.currency ?? order.currency) as CurrencyCode;
  const locale = restaurant?.locale ?? 'en-US';

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{order.publicOrderId}</h1>
          <p className="text-muted-foreground text-sm">
            {order.customer.name} · {order.customer.email}
          </p>
        </div>
        <Link href="/admin/orders" className="text-foreground text-sm underline underline-offset-4">
          ← Orders
        </Link>
      </header>

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Status</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          {order.channel} · {order.type} · {order.payment.status}
        </p>
        <OrderStatusControl orderId={String(order._id)} currentStatus={order.status} />
        <ul className="text-muted-foreground mt-3 space-y-1 text-xs">
          {order.statusHistory.map((event, i) => (
            <li key={i}>
              <span className="text-foreground font-medium">{event.status}</span> ·{' '}
              {new Date(event.at).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Items</h2>
        <ul className="divide-border mt-3 divide-y text-sm">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-start justify-between gap-4 py-2">
              <div className="min-w-0">
                <p className="text-foreground font-medium">
                  {item.quantity}× {item.name}
                </p>
                {item.modifiers.length > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {item.modifiers.map((m) => m.optionName).join(', ')}
                  </p>
                ) : null}
                {item.notes ? (
                  <p className="text-muted-foreground mt-1 text-xs italic">“{item.notes}”</p>
                ) : null}
              </div>
              <span className="text-foreground font-mono text-sm">
                {formatMoney(item.lineTotalMinor, currency, locale)}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-border mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">{formatMoney(order.subtotalMinor, currency, locale)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="font-mono">{formatMoney(order.taxMinor, currency, locale)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="font-mono">{formatMoney(order.totalMinor, currency, locale)}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
