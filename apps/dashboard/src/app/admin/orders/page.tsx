import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import { requirePageFlag } from '@/lib/session';
import { OrdersLive } from './orders-live';

export const dynamic = 'force-dynamic';

export default async function DashboardOrdersPage() {
  const { session, restaurantId } = await requirePageFlag(['orders.view_all']);

  const conn = await getMongoConnection('live');
  const { Restaurant, Order } = getModels(conn);

  const [restaurant, orders] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Order.find({ restaurantId }).sort({ createdAt: -1 }).limit(50).lean().exec(),
  ]);

  const currency = currencyCodeOrDefault(restaurant?.currency);
  const locale = restaurant?.locale ?? 'en-US';

  const rows = orders.map((o) => ({
    id: String(o._id),
    publicOrderId: o.publicOrderId,
    channel: o.channel,
    type: o.type,
    status: o.status,
    paymentStatus: o.payment.status,
    customerName: o.customer.name,
    totalLabel: formatMoney(o.totalMinor, currency, locale),
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">
            Live feed for {restaurant?.name} · last 50 orders
          </p>
        </div>
        <Link
          href="/admin"
          className="border-input hover:bg-accent text-sm underline underline-offset-4"
        >
          ← Back to dashboard
        </Link>
      </header>

      <OrdersLive restaurantId={session.restaurantId} initialRows={rows} />
    </main>
  );
}
