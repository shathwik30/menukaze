import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import { requirePageFlag } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ days?: string; channel?: string }>;
}

const RANGE_OPTIONS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const CHANNEL_OPTIONS = [
  { id: 'all', label: 'All channels' },
  { id: 'storefront', label: 'Storefront' },
  { id: 'qr_dinein', label: 'QR Dine-In' },
  { id: 'kiosk', label: 'Kiosk' },
  { id: 'walk_in', label: 'Walk-in' },
  { id: 'api', label: 'API' },
];

const REVENUE_STATUSES = ['confirmed', 'preparing', 'ready', 'served', 'completed'];

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const { restaurantId } = await requirePageFlag(['analytics.view']);
  const params = await searchParams;
  const days = Math.max(1, Math.min(365, Number(params.days ?? '7') || 7));
  const channel =
    params.channel && CHANNEL_OPTIONS.some((c) => c.id === params.channel) ? params.channel : 'all';

  const conn = await getMongoConnection('live');
  const { Order, Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId, { currency: 1, locale: 1 })
    .lean()
    .exec();
  const currency = currencyCodeOrDefault(restaurant?.currency);
  const locale = restaurant?.locale ?? 'en-US';

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const baseMatch: Record<string, unknown> = {
    restaurantId,
    createdAt: { $gte: since },
    status: { $in: REVENUE_STATUSES },
  };
  if (channel !== 'all') baseMatch.channel = channel;

  const [totals, byChannel, topItems, hourlyBuckets] = await Promise.all([
    Order.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$totalMinor' },
          orders: { $sum: 1 },
        },
      },
    ]).exec() as Promise<Array<{ _id: null; revenue: number; orders: number }>>,
    Order.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$channel',
          revenue: { $sum: '$totalMinor' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]).exec() as Promise<Array<{ _id: string; revenue: number; orders: number }>>,
    Order.aggregate([
      { $match: baseMatch },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.itemId',
          name: { $first: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotalMinor' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]).exec() as Promise<Array<{ _id: unknown; name: string; quantity: number; revenue: number }>>,
    Order.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          orders: { $sum: 1 },
        },
      },
    ]).exec() as Promise<Array<{ _id: number; orders: number }>>,
  ]);

  const totalsRow = totals[0] ?? { revenue: 0, orders: 0 };
  const aov = totalsRow.orders > 0 ? totalsRow.revenue / totalsRow.orders : 0;

  const hourlyMap = new Map<number, number>(hourlyBuckets.map((h) => [h._id, h.orders]));
  const peakHours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: hourlyMap.get(hour) ?? 0,
  }));
  const peakMax = peakHours.reduce((max, h) => Math.max(max, h.orders), 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Last {days} day{days === 1 ? '' : 's'}
            {channel === 'all' ? '' : ` · ${channel.replace('_', ' ')}`}
          </p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      <form className="flex flex-wrap gap-2" method="get">
        <select
          name="days"
          defaultValue={String(days)}
          className="border-border h-9 rounded-md border px-2 text-sm"
        >
          {RANGE_OPTIONS.map((opt) => (
            <option key={opt.days} value={opt.days}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          name="channel"
          defaultValue={channel}
          className="border-border h-9 rounded-md border px-2 text-sm"
        >
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="border-border hover:bg-muted inline-flex h-9 items-center rounded-md border px-3 text-sm"
        >
          Apply
        </button>
      </form>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Revenue" value={formatMoney(totalsRow.revenue, currency, locale)} />
        <Stat label="Orders" value={String(totalsRow.orders)} />
        <Stat label="Avg order value" value={formatMoney(Math.round(aov), currency, locale)} />
      </section>

      <section className="border-border space-y-3 rounded-md border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Channel breakdown</h2>
        {byChannel.length === 0 ? (
          <p className="text-muted-foreground text-sm">No orders in range.</p>
        ) : (
          byChannel.map((row) => {
            const pct =
              totalsRow.revenue > 0 ? Math.round((row.revenue / totalsRow.revenue) * 100) : 0;
            return (
              <div key={row._id} className="flex items-center gap-3 text-sm">
                <span className="w-24 capitalize">{row._id.replace('_', ' ')}</span>
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-muted-foreground w-16 text-right text-xs">{pct}%</span>
                <span className="w-28 text-right font-mono text-xs">
                  {formatMoney(row.revenue, currency, locale)}
                </span>
                <span className="text-muted-foreground w-12 text-right text-xs">{row.orders}</span>
              </div>
            );
          })
        )}
      </section>

      <section className="border-border space-y-3 rounded-md border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Peak hours</h2>
        <div className="sm:grid-cols-24 grid grid-cols-12 gap-1">
          {peakHours.map((h) => {
            const intensity = peakMax > 0 ? h.orders / peakMax : 0;
            const opacity = 0.1 + intensity * 0.9;
            return (
              <div
                key={h.hour}
                title={`${String(h.hour).padStart(2, '0')}:00 — ${h.orders} order${h.orders === 1 ? '' : 's'}`}
                className="flex h-10 flex-col items-center justify-center rounded-sm bg-emerald-500 text-[10px] text-white"
                style={{ opacity }}
              >
                {h.hour}
              </div>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          Hour of day (server time). Darker = more orders.
        </p>
      </section>

      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Top 10 items</h2>
        {topItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing sold in range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="py-1">Item</th>
                <th className="py-1 text-right">Qty</th>
                <th className="py-1 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topItems.map((row, i) => (
                <tr key={i} className="border-border border-t">
                  <td className="py-1">{row.name}</td>
                  <td className="py-1 text-right text-xs">{row.quantity}</td>
                  <td className="py-1 text-right font-mono text-xs">
                    {formatMoney(row.revenue, currency, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-md border p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
