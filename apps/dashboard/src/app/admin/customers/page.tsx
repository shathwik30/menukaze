import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import { requirePageFlag } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string; sort?: string }>;
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const { restaurantId } = await requirePageFlag(['customers.view']);
  const params = await searchParams;
  const query = params.q?.trim() ?? '';
  const sort = params.sort === 'recent' ? 'recent' : 'top';

  const conn = await getMongoConnection('live');
  const { Customer, Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId, { locale: 1, currency: 1 })
    .lean()
    .exec();
  const locale = restaurant?.locale ?? 'en-US';

  const filter: Record<string, unknown> = { restaurantId };
  if (query) {
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { email: { $regex: safe, $options: 'i' } },
      { name: { $regex: safe, $options: 'i' } },
      { phone: { $regex: safe } },
    ];
  }
  const sortKey: Record<string, -1> =
    sort === 'recent' ? { lastOrderAt: -1 } : { lifetimeOrders: -1 };
  const customers = await Customer.find(filter).sort(sortKey).limit(100).lean().exec();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">
            {customers.length} record{customers.length === 1 ? '' : 's'}, deduped by email.
          </p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search email, name, phone"
          className="border-border h-9 flex-1 rounded-md border px-3 text-sm"
        />
        <select
          name="sort"
          defaultValue={sort}
          className="border-border h-9 rounded-md border px-2 text-sm"
        >
          <option value="top">Top spenders</option>
          <option value="recent">Recently active</option>
        </select>
        <button
          type="submit"
          className="border-border hover:bg-muted inline-flex h-9 items-center rounded-md border px-3 text-sm"
        >
          Search
        </button>
      </form>

      {customers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No customers yet. They appear here as soon as someone places an order.
        </p>
      ) : (
        <table className="border-border w-full border text-sm">
          <thead className="bg-muted/50 text-left text-xs tracking-wide uppercase">
            <tr>
              <th className="px-3 py-2">Name / Email</th>
              <th className="px-3 py-2">First channel</th>
              <th className="px-3 py-2">Orders</th>
              <th className="px-3 py-2">Lifetime</th>
              <th className="px-3 py-2">Last order</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const currency = currencyCodeOrDefault(c.currency);
              return (
                <tr key={String(c._id)} className="border-border border-t">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/customers/${String(c._id)}`}
                      className="font-medium hover:underline"
                    >
                      {c.name ?? c.email}
                    </Link>
                    {c.name ? <p className="text-muted-foreground text-xs">{c.email}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-xs uppercase">{c.firstChannel}</td>
                  <td className="px-3 py-2 text-xs">{c.lifetimeOrders}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {formatMoney(c.lifetimeRevenueMinor, currency, locale)}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">
                    {new Date(c.lastOrderAt).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
