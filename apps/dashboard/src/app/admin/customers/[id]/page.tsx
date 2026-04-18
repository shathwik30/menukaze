import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import { requirePageFlag } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { restaurantId } = await requirePageFlag(['customers.view']);
  const { id } = await params;
  const customerObjectId = parseObjectId(id);
  if (!customerObjectId) notFound();

  const conn = await getMongoConnection('live');
  const { Customer, Order, Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId, { locale: 1 }).lean().exec();
  const locale = restaurant?.locale ?? 'en-US';

  const customer = await Customer.findOne({ restaurantId, _id: customerObjectId }).lean().exec();
  if (!customer) notFound();

  const orders = await Order.find(
    { restaurantId, 'customer.email': customer.email },
    {
      publicOrderId: 1,
      channel: 1,
      type: 1,
      status: 1,
      createdAt: 1,
      totalMinor: 1,
      currency: 1,
    },
  )
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
    .exec();

  const currency = currencyCodeOrDefault(customer.currency);
  const channelEntries = (Object.entries(customer.channelCounts) as Array<[string, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const mostUsedChannel = channelEntries[0]?.[0] ?? customer.firstChannel;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{customer.name ?? customer.email}</h1>
          {customer.name ? (
            <p className="text-muted-foreground text-sm">
              <a href={`mailto:${customer.email}`} className="underline">
                {customer.email}
              </a>
              {customer.phone ? <> · {customer.phone}</> : null}
            </p>
          ) : null}
        </div>
        <Link href="/admin/customers" className="text-foreground text-sm underline">
          ← Back
        </Link>
      </header>

      <section className="border-border grid gap-3 rounded-md border p-4 sm:grid-cols-3">
        <Stat
          label="Lifetime spend"
          value={formatMoney(customer.lifetimeRevenueMinor, currency, locale)}
        />
        <Stat label="Orders" value={String(customer.lifetimeOrders)} />
        <Stat label="First seen" value={new Date(customer.firstOrderAt).toLocaleDateString()} />
        <Stat label="First channel" value={customer.firstChannel.replace('_', ' ')} />
        <Stat label="Most-used channel" value={mostUsedChannel.replace('_', ' ')} />
        <Stat label="Last order" value={new Date(customer.lastOrderAt).toLocaleString()} />
      </section>

      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Channel breakdown</h2>
        {channelEntries.map(([channel, count]) => (
          <div key={channel} className="flex items-center justify-between text-sm">
            <span className="capitalize">{channel.replace('_', ' ')}</span>
            <span className="text-muted-foreground font-mono text-xs">{count}</span>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Recent orders</h2>
        {orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No order history.</p>
        ) : (
          <ul className="border-border divide-border divide-y rounded-md border">
            {orders.map((o) => (
              <li key={String(o._id)} className="flex items-center gap-3 p-3 text-sm">
                <span className="font-mono text-xs">{o.publicOrderId}</span>
                <span className="text-muted-foreground text-xs uppercase">{o.channel}</span>
                <span className="text-muted-foreground text-xs">{o.status}</span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {new Date(o.createdAt).toLocaleString()}
                </span>
                <span className="font-mono text-xs">
                  {formatMoney(o.totalMinor, currencyCodeOrDefault(o.currency), locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}
