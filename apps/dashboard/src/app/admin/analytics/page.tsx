import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Eyebrow,
  Select,
  StatCard,
  cn,
} from '@menukaze/ui';
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
  const topMax = topItems.reduce((max, i) => Math.max(max, i.revenue), 0);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow withBar tone="accent">
            Overview
          </Eyebrow>
          <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight font-medium tracking-tight sm:text-5xl">
            Analytics
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-2 text-sm">
            Last {days} day{days === 1 ? '' : 's'}
            {channel !== 'all' ? ` · ${channel.replace('_', ' ')}` : ''}
          </p>
        </div>

        <form method="get" className="flex flex-wrap items-end gap-2">
          <Select name="days" defaultValue={String(days)} className="h-10 w-auto">
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.days} value={opt.days}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Select name="channel" defaultValue={channel} className="h-10 w-auto">
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="primary" size="md">
            Apply
          </Button>
        </form>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Revenue"
          value={formatMoney(totalsRow.revenue, currency, locale)}
          caption={`${days}d window`}
          icon={<CashIcon />}
        />
        <StatCard
          label="Orders"
          value={totalsRow.orders}
          caption={totalsRow.orders === 1 ? 'order' : 'orders'}
          icon={<ReceiptIcon />}
        />
        <StatCard
          label="Avg order value"
          value={formatMoney(Math.round(aov), currency, locale)}
          caption="per order"
          icon={<TrendIcon />}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card variant="surface" radius="lg" className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Channel breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {byChannel.length === 0 ? (
              <EmptyState
                compact
                title="No orders in range"
                description="Try a longer window or a different channel."
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {byChannel.map((row) => {
                  const pct =
                    totalsRow.revenue > 0 ? Math.round((row.revenue / totalsRow.revenue) * 100) : 0;
                  return (
                    <li
                      key={row._id}
                      className="grid grid-cols-[120px_1fr_auto] items-center gap-4"
                    >
                      <span className="text-foreground truncate text-sm font-medium capitalize">
                        {row._id.replace('_', ' ')}
                      </span>
                      <div className="bg-canvas-100 dark:bg-ink-800 relative h-8 overflow-hidden rounded-lg">
                        <div
                          className="from-saffron-400 to-saffron-600 h-full rounded-lg bg-gradient-to-r transition-[width] duration-700"
                          style={{ width: `${pct}%` }}
                        />
                        <span className="text-ink-950/80 absolute inset-y-0 left-3 flex items-center text-xs font-medium mix-blend-multiply">
                          {pct}%
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="mk-nums text-foreground font-mono text-sm font-medium tabular-nums">
                          {formatMoney(row.revenue, currency, locale)}
                        </p>
                        <p className="text-ink-500 dark:text-ink-400 text-[11px]">
                          {row.orders} order{row.orders === 1 ? '' : 's'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card variant="surface" radius="lg" className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Peak hours</CardTitle>
              <p className="text-ink-500 dark:text-ink-400 text-xs">
                Hour of day · darker = more orders
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-1.5">
              {peakHours.map((h) => {
                const intensity = peakMax > 0 ? h.orders / peakMax : 0;
                return (
                  <div
                    key={h.hour}
                    title={`${String(h.hour).padStart(2, '0')}:00 — ${h.orders} order${h.orders === 1 ? '' : 's'}`}
                    className="group relative flex h-12 flex-col items-center justify-center rounded-md text-[10px] font-medium transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    style={{
                      backgroundColor:
                        intensity === 0
                          ? 'oklch(0.96 0.005 82)'
                          : `oklch(${0.88 - intensity * 0.4} ${0.08 + intensity * 0.1} ${68 - intensity * 15})`,
                      color: intensity > 0.4 ? 'oklch(0.98 0.01 82)' : 'oklch(0.42 0.012 84)',
                    }}
                  >
                    {h.hour}
                  </div>
                );
              })}
            </div>
            <div className="text-ink-500 dark:text-ink-400 mt-4 flex items-center gap-3 text-[11px]">
              <span>Less</span>
              <div className="flex flex-1 gap-1">
                {[0.1, 0.3, 0.5, 0.7, 0.95].map((intensity) => (
                  <span
                    key={intensity}
                    className="h-2 flex-1 rounded-sm"
                    style={{
                      backgroundColor: `oklch(${0.88 - intensity * 0.4} ${0.08 + intensity * 0.1} ${68 - intensity * 15})`,
                    }}
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card variant="surface" radius="lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Top 10 items</CardTitle>
            <Badge variant="subtle" size="sm" shape="pill">
              By revenue
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {topItems.length === 0 ? (
            <EmptyState
              compact
              title="Nothing sold yet"
              description="Items will appear here once orders include them."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {topItems.map((row, i) => {
                const pct = topMax > 0 ? (row.revenue / topMax) * 100 : 0;
                return (
                  <li
                    key={i}
                    className="border-ink-100 bg-canvas-50/70 dark:border-ink-800 dark:bg-ink-900/50 group relative overflow-hidden rounded-xl border px-4 py-3"
                  >
                    <div
                      aria-hidden
                      className="bg-saffron-400/15 group-hover:bg-saffron-400/25 absolute inset-y-0 left-0 transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold',
                            i === 0
                              ? 'mk-foil text-ink-950 ring-saffron-600/20 ring-1'
                              : 'bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950',
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="text-foreground truncate font-serif text-[15px] font-medium">
                          {row.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-5 text-sm">
                        <span className="text-ink-500 dark:text-ink-400">{row.quantity} sold</span>
                        <span className="mk-nums text-foreground font-mono font-medium tabular-nums">
                          {formatMoney(row.revenue, currency, locale)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}
function ReceiptIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 2v20l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2V2l-2 2-2-2-2 2-2-2-2 2-2-2-2 2Z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
function TrendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
