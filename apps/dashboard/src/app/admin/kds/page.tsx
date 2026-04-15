import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { Badge, Eyebrow, cn } from '@menukaze/ui';
import { requirePageFlag } from '@/lib/session';
import { KdsBoard, type KdsCard, type KdsLine, type KdsStation } from './kds-board';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ station?: string }>;
}

export default async function KdsPage({ searchParams }: PageProps) {
  const { session, restaurantId } = await requirePageFlag(['kds.view']);
  const params = await searchParams;
  const stationFilter = params.station?.trim() ? params.station : null;

  const conn = await getMongoConnection('live');
  const { Restaurant, Order, Table, Station } = getModels(conn);

  const [restaurant, orders, stations] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Order.find({
      restaurantId,
      status: { $in: ['received', 'confirmed', 'preparing', 'ready'] },
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec(),
    Station.find({ restaurantId, archived: false }).sort({ order: 1 }).lean().exec(),
  ]);

  const tableIds = Array.from(
    new Set(orders.map((o) => o.tableId).filter((id): id is NonNullable<typeof id> => Boolean(id))),
  );
  const tables =
    tableIds.length > 0
      ? await Table.find({ restaurantId, _id: { $in: tableIds } })
          .lean()
          .exec()
      : [];
  const tableNumberById = new Map(tables.map((t) => [String(t._id), t.number]));
  const stationNameById = new Map(stations.map((s) => [String(s._id), s.name]));

  const cards: KdsCard[] = [];
  for (const o of orders) {
    const lines: KdsLine[] = o.items.map((item) => ({
      id: item._id ? String(item._id) : '',
      quantity: item.quantity,
      name: item.name,
      modifiers: item.modifiers.map((m) => m.optionName),
      ...(item.notes ? { notes: item.notes } : {}),
      stationId: item.stationId ? String(item.stationId) : null,
      stationName: item.stationId ? (stationNameById.get(String(item.stationId)) ?? null) : null,
      lineStatus: (item.lineStatus ?? 'received') as KdsLine['lineStatus'],
    }));
    const visibleLines = stationFilter
      ? lines.filter((line) => line.stationId === stationFilter)
      : lines;
    if (stationFilter && visibleLines.length === 0) continue;
    const card: KdsCard = {
      id: String(o._id),
      publicOrderId: o.publicOrderId,
      channel: o.channel,
      type: o.type,
      status: o.status,
      createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
      items: visibleLines,
      ...(o.tableId ? { tableId: String(o.tableId) } : {}),
      ...(o.tableId && tableNumberById.get(String(o.tableId)) !== undefined
        ? { tableNumber: tableNumberById.get(String(o.tableId))! }
        : {}),
    };
    if (o.suspicious) card.suspicious = true;
    if (o.suspiciousReason) card.suspiciousReason = o.suspiciousReason;
    cards.push(card);
  }

  const stationOptions: KdsStation[] = stations.map((s) => ({
    id: String(s._id),
    name: s.name,
    color: s.color ?? null,
  }));
  const activeStation = stationFilter ? stationOptions.find((s) => s.id === stationFilter) : null;

  return (
    <div className="flex min-h-screen flex-col gap-5 px-6 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Eyebrow tone="accent">
            <span className="bg-mkrose-500 relative inline-flex size-2 rounded-full">
              <span className="bg-mkrose-500 absolute inset-0 animate-ping rounded-full opacity-60" />
            </span>
            Kitchen display · Live
          </Eyebrow>
          <h1 className="text-foreground mt-2 font-serif text-3xl font-medium tracking-tight sm:text-4xl">
            {activeStation ? `${activeStation.name} station` : 'Kitchen Display'}
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">
            {restaurant?.name} · {cards.length} open ticket{cards.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {stationOptions.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/kds"
            className={cn(
              'inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium transition-colors',
              !stationFilter
                ? 'bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950'
                : 'bg-canvas-100 text-ink-700 hover:bg-canvas-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700',
            )}
          >
            All stations
            <Badge variant="subtle" size="xs" shape="pill" className="ml-2 bg-transparent">
              {stationOptions.length}
            </Badge>
          </Link>
          {stationOptions.map((station) => {
            const active = stationFilter === station.id;
            return (
              <Link
                key={station.id}
                href={`/admin/kds?station=${encodeURIComponent(station.id)}`}
                className={cn(
                  'inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium transition-colors',
                  active
                    ? 'bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950'
                    : 'bg-canvas-100 text-ink-700 hover:bg-canvas-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700',
                )}
              >
                {station.name}
              </Link>
            );
          })}
          <Link
            href="/admin/stations"
            className="text-ink-500 hover:text-ink-950 dark:text-ink-400 dark:hover:text-canvas-50 ml-auto text-xs font-medium underline-offset-4 hover:underline"
          >
            Manage stations →
          </Link>
        </nav>
      ) : null}

      <KdsBoard
        restaurantId={session.restaurantId}
        initialCards={cards}
        stationFilter={stationFilter}
      />
    </div>
  );
}
