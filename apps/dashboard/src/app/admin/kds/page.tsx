import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
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

  const [, orders, stations] = await Promise.all([
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
      ...(typeof o.pickupNumber === 'number' ? { pickupNumber: o.pickupNumber } : {}),
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

  // Stats computed from server-time snapshot
  const nowMs = Date.now();
  const totalItems = cards.reduce((n, c) => n + c.items.length, 0);
  const lateCount = cards.filter(
    (c) => nowMs - new Date(c.createdAt).getTime() >= 10 * 60_000,
  ).length;
  const hotCount = cards.filter((c) => {
    const age = (nowMs - new Date(c.createdAt).getTime()) / 60_000;
    return age >= 5 && age < 10;
  }).length;
  const avgMs =
    cards.length > 0
      ? cards.reduce((s, c) => s + (nowMs - new Date(c.createdAt).getTime()), 0) / cards.length
      : 0;
  const avgMin = Math.floor(avgMs / 60_000);
  const avgSec = Math.floor((avgMs % 60_000) / 1_000);
  const avgLabel = cards.length > 0 ? `${avgMin}:${String(avgSec).padStart(2, '0')}` : '—';

  return (
    <div
      style={{
        background: 'var(--mk-ink-950)',
        minHeight: 'calc(100vh - 60px)',
        color: 'var(--mk-canvas-50)',
      }}
    >
      {/* KDS topbar */}
      <div
        style={{
          padding: '14px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
          borderBottom: '1px solid oklch(1 0 0 / 0.06)',
          background: 'oklch(0.085 0.017 92 / 0.92)',
          backdropFilter: 'blur(20px)',
          position: 'sticky',
          top: 60,
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--mk-saffron-300)',
              }}
            >
              Kitchen display
            </div>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                marginTop: 2,
              }}
            >
              {activeStation ? `${activeStation.name} station` : 'All stations'}
              {' · '}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>{cards.length}</span>
              {' ticket'}
              {cards.length !== 1 ? 's' : ''}
              {totalItems > 0 ? (
                <span
                  style={{
                    fontWeight: 400,
                    fontSize: 14,
                    color: 'oklch(1 0 0 / 0.55)',
                    marginLeft: 6,
                  }}
                >
                  · {totalItems} item{totalItems !== 1 ? 's' : ''} in flight
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Live stats */}
          {cards.length > 0 ? (
            <div style={{ display: 'flex', gap: 20 }}>
              <KdsStat label="Avg ticket" value={avgLabel} tone="ok" />
              <KdsStat label={`Hot (≥5m)`} value={String(hotCount)} tone="hot" />
              <KdsStat label={`Late (≥10m)`} value={String(lateCount)} tone="late" />
            </div>
          ) : null}

          {/* Divider */}
          {cards.length > 0 && stationOptions.length > 0 ? (
            <div style={{ width: 1, height: 28, background: 'oklch(1 0 0 / 0.1)' }} />
          ) : null}

          {/* Station filter tabs */}
          {stationOptions.length > 0 ? (
            <div
              style={{
                display: 'inline-flex',
                gap: 2,
                padding: 3,
                background: 'oklch(1 0 0 / 0.06)',
                borderRadius: 10,
              }}
            >
              <Link
                href="/admin/kds"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 28,
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 7,
                  background: !stationFilter ? 'var(--mk-canvas-50)' : 'transparent',
                  color: !stationFilter ? 'var(--mk-ink-950)' : 'oklch(1 0 0 / 0.65)',
                  textDecoration: 'none',
                  transition: 'all 150ms',
                }}
              >
                All stations
              </Link>
              {stationOptions.map((station) => {
                const active = stationFilter === station.id;
                return (
                  <Link
                    key={station.id}
                    href={`/admin/kds?station=${encodeURIComponent(station.id)}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 28,
                      padding: '0 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 7,
                      background: active ? 'var(--mk-canvas-50)' : 'transparent',
                      color: active ? 'var(--mk-ink-950)' : 'oklch(1 0 0 / 0.65)',
                      textDecoration: 'none',
                      transition: 'all 150ms',
                    }}
                  >
                    {station.name}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ padding: '20px 32px 40px' }}>
        <KdsBoard
          restaurantId={session.restaurantId}
          initialCards={cards}
          stationFilter={stationFilter}
        />
      </div>
    </div>
  );
}

function KdsStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'ok' | 'hot' | 'late';
}) {
  const colors = {
    ok: 'var(--mk-jade-300)',
    hot: 'var(--mk-saffron-300)',
    late: 'var(--mk-rose-300)',
  };
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'oklch(1 0 0 / 0.4)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 17,
          fontWeight: 700,
          color: colors[tone],
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}
