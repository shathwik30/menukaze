import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { KdsBoard, type KdsCard, type KdsLine, type KdsStation } from './kds-board';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ station?: string }>;
}

/**
 * Kitchen display system. Shows every open order. When the `?station=X`
 * query param is set, the board scopes to a single station: only orders
 * with at least one line for that station appear, and only that station's
 * lines are shown / actionable. Without a station filter, the board acts as
 * the legacy single-screen KDS for the full feed.
 */
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

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kitchen Display</h1>
          <p className="text-muted-foreground text-sm">{restaurant?.name}</p>
        </div>
        <Link href="/admin" className="border-input text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      {stationOptions.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/admin/kds"
            className={`border-border rounded-md border px-2 py-1 ${
              stationFilter ? 'hover:bg-muted' : 'bg-foreground text-background'
            }`}
          >
            All stations
          </Link>
          {stationOptions.map((station) => (
            <Link
              key={station.id}
              href={`/admin/kds?station=${encodeURIComponent(station.id)}`}
              className={`border-border rounded-md border px-2 py-1 ${
                stationFilter === station.id ? 'bg-foreground text-background' : 'hover:bg-muted'
              }`}
            >
              {station.name}
            </Link>
          ))}
          <Link
            href="/admin/stations"
            className="text-muted-foreground ml-auto underline-offset-2 hover:underline"
          >
            Manage stations
          </Link>
        </nav>
      ) : null}

      <KdsBoard
        restaurantId={session.restaurantId}
        initialCards={cards}
        stationFilter={stationFilter}
      />
    </main>
  );
}
