import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import { Button, Eyebrow } from '@menukaze/ui';
import { requirePageFlag } from '@/lib/session';
import { OrdersLive } from './orders-live';

export const dynamic = 'force-dynamic';

export default async function DashboardOrdersPage() {
  const { session, restaurantId, permissions } = await requirePageFlag(['orders.view_all']);
  const canCreateWalkIn = permissions.includes('orders.create_walkin');

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
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow withBar tone="accent">
            Operations · Live
          </Eyebrow>
          <h1 className="text-foreground mt-3 font-serif text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
            Orders
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-2 text-sm">
            Live feed for {restaurant?.name} — showing the most recent 50 orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateWalkIn ? (
            <Link href="/admin/orders/new">
              <Button variant="primary" size="md">
                <PlusIcon /> New walk-in
              </Button>
            </Link>
          ) : null}
        </div>
      </header>

      <OrdersLive restaurantId={session.restaurantId} initialRows={rows} />
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-4"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
