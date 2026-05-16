import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney, startOfTodayInTimezone } from '@menukaze/shared';
import { requireOnboardedRestaurant } from '@/lib/session';
import { computeChecklist } from '@/lib/onboarding-checklist';
import { OnboardingChecklistCard } from './onboarding-checklist-card';

export const dynamic = 'force-dynamic';

const ACTIVE_ORDER_STATUSES = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
] as const;
const ACTIVE_TABLE_SESSION_STATUSES = ['active', 'bill_requested', 'needs_review'] as const;

interface SeriesWindow {
  currentStart: Date;
  previousStart: Date;
}

interface HourlySeries {
  currentRevenueMinor: number[];
  previousRevenueMinor: number[];
  currentOrderCount: number[];
  labels: string[];
}

interface SeriesOrder {
  createdAt: Date | string;
  totalMinor?: number | null;
}

function buildSeriesWindow(now: Date): SeriesWindow {
  const currentStart = new Date(now);
  currentStart.setMinutes(0, 0, 0);
  currentStart.setHours(currentStart.getHours() - 11);

  const previousStart = new Date(currentStart);
  previousStart.setHours(previousStart.getHours() - 12);

  return { currentStart, previousStart };
}

function buildHourlySeries(
  orders: SeriesOrder[],
  window: SeriesWindow,
  locale: string,
): HourlySeries {
  const hourMs = 60 * 60 * 1000;
  const buckets = Array.from({ length: 12 }, (_, index) => {
    const start = new Date(window.currentStart.getTime() + index * hourMs);
    return {
      start,
      currentRevenueMinor: 0,
      previousRevenueMinor: 0,
      currentOrderCount: 0,
    };
  });
  const previousEnd = window.currentStart;
  const currentEnd = new Date(window.currentStart.getTime() + 12 * hourMs);

  for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    const totalMinor = Math.max(0, Number(order.totalMinor ?? 0));
    if (createdAt >= window.currentStart && createdAt < currentEnd) {
      const index = Math.floor((createdAt.getTime() - window.currentStart.getTime()) / hourMs);
      const bucket = buckets[index];
      if (bucket) {
        bucket.currentRevenueMinor += totalMinor;
        bucket.currentOrderCount += 1;
      }
    } else if (createdAt >= window.previousStart && createdAt < previousEnd) {
      const index = Math.floor((createdAt.getTime() - window.previousStart.getTime()) / hourMs);
      const bucket = buckets[index];
      if (bucket) bucket.previousRevenueMinor += totalMinor;
    }
  }

  return {
    currentRevenueMinor: buckets.map((bucket) => bucket.currentRevenueMinor),
    previousRevenueMinor: buckets.map((bucket) => bucket.previousRevenueMinor),
    currentOrderCount: buckets.map((bucket) => bucket.currentOrderCount),
    labels: buckets.map((bucket, index) =>
      index === buckets.length - 1
        ? 'Now'
        : bucket.start.toLocaleTimeString(locale, { hour: 'numeric' }),
    ),
  };
}

export default async function DashboardAdminPage() {
  const { session, restaurantId } = await requireOnboardedRestaurant();

  const conn = await getMongoConnection('live');
  const { Restaurant, Category, Item, Table, Order, TableSession } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  const now = new Date();
  const todayStart = startOfTodayInTimezone(restaurant?.timezone);
  const seriesWindow = buildSeriesWindow(now);
  const [
    categories,
    items,
    tables,
    activeTableSessions,
    activeOrders,
    recentSeriesOrders,
    orderAgg,
  ] = await Promise.all([
    Category.find({ restaurantId }).sort({ order: 1 }).exec(),
    Item.find({ restaurantId }).sort({ createdAt: 1 }).exec(),
    Table.find({ restaurantId }).sort({ number: 1 }).exec(),
    TableSession.find({
      restaurantId,
      status: { $in: ACTIVE_TABLE_SESSION_STATUSES },
    })
      .sort({ lastActivityAt: -1 })
      .lean()
      .exec(),
    Order.find(
      {
        restaurantId,
        status: { $in: ACTIVE_ORDER_STATUSES },
      },
      { tableId: 1, status: 1 },
    )
      .lean()
      .exec(),
    Order.find(
      {
        restaurantId,
        createdAt: { $gte: seriesWindow.previousStart },
        status: { $nin: ['cancelled'] },
      },
      { createdAt: 1, totalMinor: 1 },
    )
      .lean()
      .exec(),
    Order.aggregate<{
      todayCount: number;
      todayRevenueMinor: number;
    }>([
      { $match: { restaurantId } },
      {
        $facet: {
          today: [
            {
              $match: {
                createdAt: { $gte: todayStart },
                status: { $nin: ['cancelled'] },
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                revenueMinor: { $sum: '$totalMinor' },
              },
            },
          ],
        },
      },
      {
        $project: {
          todayCount: { $ifNull: [{ $arrayElemAt: ['$today.count', 0] }, 0] },
          todayRevenueMinor: { $ifNull: [{ $arrayElemAt: ['$today.revenueMinor', 0] }, 0] },
        },
      },
    ]).catch(() => []),
  ]);

  const currency = currencyCodeOrDefault(restaurant?.currency);
  const locale = restaurant?.locale ?? 'en-US';
  const slug = restaurant?.slug ?? 'demo';
  const firstTable = tables[0];
  const has = (flag: (typeof session.permissions)[number]) => session.permissions.includes(flag);
  const canEditMenu = has('menu.edit');
  const canPrintQr = has('tables.qr_print');
  const canViewSettings = session.permissions.some((flag) => flag.startsWith('settings.'));
  const stats = {
    ...(orderAgg[0] ?? { todayCount: 0, todayRevenueMinor: 0 }),
    activeCount: activeOrders.length,
  };
  const hourlySeries = buildHourlySeries(recentSeriesOrders, seriesWindow, locale);

  const sessionStatusByTableId = new Map(
    activeTableSessions.map((tableSession) => [String(tableSession.tableId), tableSession.status]),
  );
  const activeOrderTableIds = new Set(
    activeOrders
      .map((order) => (order.tableId ? String(order.tableId) : null))
      .filter((tableId): tableId is string => Boolean(tableId)),
  );
  const displayTables = tables.map((table) => {
    const tableId = String(table._id);
    const sessionStatus = sessionStatusByTableId.get(tableId);
    const status =
      sessionStatus === 'bill_requested' || sessionStatus === 'needs_review'
        ? sessionStatus
        : sessionStatus === 'active' || activeOrderTableIds.has(tableId)
          ? 'occupied'
          : 'available';
    return {
      id: tableId,
      name: table.name,
      capacity: table.capacity,
      status,
    };
  });

  const showChecklist = restaurant && !restaurant.checklistDismissed && canViewSettings;
  const checklist = restaurant ? computeChecklist(restaurant, items, tables) : null;

  const firstName = session.user.name?.split(' ')[0] ?? 'there';
  const greeting = greetingFor(new Date());

  const TABLE_STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string }> = {
    available: { label: 'Available', dot: 'var(--mk-jade-500)', bg: 'var(--mk-jade-50)' },
    occupied: { label: 'Occupied', dot: 'var(--mk-saffron-500)', bg: 'var(--mk-saffron-50)' },
    bill_requested: {
      label: 'Bill requested',
      dot: 'var(--mk-lapis-500)',
      bg: 'var(--mk-lapis-50)',
    },
    paid: { label: 'Paid', dot: 'var(--mk-ink-400)', bg: 'var(--mk-canvas-200)' },
    needs_review: { label: 'Needs review', dot: 'var(--mk-rose-500)', bg: 'var(--mk-rose-50)' },
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Hero */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
        }}
      >
        {/* Gradient backdrop */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.55,
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse 50% 60% at 12% -10%, oklch(0.885 0.10 68 / 0.32), transparent 60%), radial-gradient(ellipse 40% 50% at 92% 10%, oklch(0.85 0.085 162 / 0.22), transparent 60%)',
          }}
        />
        {/* Grain */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.025,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/></svg>")`,
          }}
        />

        <div style={{ position: 'relative', padding: '36px 40px 28px', maxWidth: 1320 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--mk-saffron-700)',
            }}
          >
            {greeting} —{' '}
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 24,
              marginTop: 10,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-serif)',
                  fontSize: 40,
                  fontWeight: 500,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.02,
                  color: 'var(--mk-ink-950)',
                  fontFeatureSettings: "'ss01','ss02','ss03'",
                }}
              >
                Welcome back, {firstName}.
              </h1>
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 14,
                  color: 'var(--mk-ink-600)',
                  maxWidth: 560,
                }}
              >
                Here&apos;s what&apos;s happening at {restaurant?.name} today.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {has('orders.view_all') ? (
                <Link href="/admin/orders" style={{ textDecoration: 'none' }}>
                  <button
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      height: 38,
                      padding: '0 16px',
                      fontSize: 13.5,
                      fontWeight: 500,
                      letterSpacing: '-0.005em',
                      borderRadius: 10,
                      whiteSpace: 'nowrap',
                      background: 'var(--mk-ink-950)',
                      color: 'var(--mk-canvas-50)',
                      border: '1px solid var(--mk-ink-950)',
                      boxShadow: 'var(--shadow-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: 'var(--mk-jade-400)',
                        animation: 'pulse-dot 1.6s ease-in-out infinite',
                      }}
                    />
                    Live orders
                  </button>
                </Link>
              ) : null}
              {has('orders.create_walkin') ? (
                <Link href="/admin/orders/new" style={{ textDecoration: 'none' }}>
                  <button
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      height: 38,
                      padding: '0 16px',
                      fontSize: 13.5,
                      fontWeight: 500,
                      letterSpacing: '-0.005em',
                      borderRadius: 10,
                      whiteSpace: 'nowrap',
                      background: 'white',
                      color: 'var(--mk-ink-950)',
                      border: '1px solid var(--mk-ink-200)',
                      boxShadow: 'var(--shadow-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    New walk-in
                  </button>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 40px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <StatCard
            label="Revenue today"
            value={formatMoney(stats.todayRevenueMinor, currency, locale)}
            sublabel="confirmed revenue"
            sparkline={hourlySeries.currentRevenueMinor}
            accentColor="var(--mk-saffron-500)"
          />
          <StatCard
            label="Orders today"
            value={String(stats.todayCount)}
            sublabel={stats.todayCount === 1 ? 'order placed' : 'orders placed'}
            sparkline={hourlySeries.currentOrderCount}
            accentColor="var(--mk-jade-500)"
          />
          <StatCard
            label="Active now"
            value={String(stats.activeCount)}
            sublabel="tickets in flight"
            accentColor="var(--mk-lapis-500)"
          />
          <StatCard
            label="Menu items"
            value={String(items.length)}
            sublabel={`${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
            accentColor="var(--mk-rose-500)"
          />
        </div>

        {/* Onboarding checklist */}
        {showChecklist && checklist ? <OnboardingChecklistCard checklist={checklist} /> : null}

        {/* Today's pulse + Floor */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Today's pulse */}
          <div
            style={{
              background: 'white',
              border: '1px solid var(--mk-ink-100)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-xs)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
                padding: '18px 22px 16px',
                borderBottom: '1px solid var(--mk-ink-100)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  Today&apos;s pulse
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--mk-ink-500)' }}>
                  Revenue and orders over the last 12 hours.
                </p>
              </div>
              {has('orders.view_all') ? (
                <Link href="/admin/analytics" style={{ textDecoration: 'none' }}>
                  <button
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 30,
                      padding: '0 12px',
                      fontSize: 12.5,
                      fontWeight: 500,
                      borderRadius: 8,
                      background: 'white',
                      color: 'var(--mk-ink-950)',
                      border: '1px solid var(--mk-ink-200)',
                      boxShadow: 'var(--shadow-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    Analytics <ArrowIcon />
                  </button>
                </Link>
              ) : null}
            </div>
            <div style={{ padding: '20px 22px 14px' }}>
              <RevenueChart
                current={hourlySeries.currentRevenueMinor}
                previous={hourlySeries.previousRevenueMinor}
                labels={hourlySeries.labels}
                currency={currency}
                locale={locale}
              />
            </div>
          </div>

          {/* Floor at a glance */}
          <div
            style={{
              background: 'white',
              border: '1px solid var(--mk-ink-100)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-xs)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
                padding: '18px 22px 16px',
                borderBottom: '1px solid var(--mk-ink-100)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  Floor at a glance
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--mk-ink-500)' }}>
                  {displayTables.length} table{displayTables.length !== 1 ? 's' : ''} ·{' '}
                  {displayTables.filter((table) => table.status === 'available').length} available
                </p>
              </div>
              {has('tables.view') ? (
                <Link href="/admin/tables" style={{ textDecoration: 'none' }}>
                  <button
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 30,
                      padding: '0 12px',
                      fontSize: 12.5,
                      fontWeight: 500,
                      borderRadius: 8,
                      background: 'white',
                      color: 'var(--mk-ink-950)',
                      border: '1px solid var(--mk-ink-200)',
                      boxShadow: 'var(--shadow-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    Manage <ArrowIcon />
                  </button>
                </Link>
              ) : null}
            </div>
            <div style={{ padding: '20px 22px' }}>
              {displayTables.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    border: '1.5px dashed var(--mk-ink-200)',
                    borderRadius: 12,
                  }}
                >
                  <p style={{ fontSize: 13, color: 'var(--mk-ink-500)', margin: 0 }}>
                    No tables configured yet.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${Math.min(8, Math.ceil(Math.sqrt(displayTables.length * 2)))}, 1fr)`,
                      gap: 6,
                    }}
                  >
                    {displayTables.map((table) => {
                      const s = TABLE_STATUS_CONFIG[table.status] ?? TABLE_STATUS_CONFIG.available!;
                      return (
                        <div
                          key={table.id}
                          style={{
                            aspectRatio: '1',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8,
                            background: s.bg,
                            border: `1px solid color-mix(in oklab, ${s.dot} 25%, transparent)`,
                            position: 'relative',
                          }}
                        >
                          <span
                            style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--mk-ink-900)' }}
                          >
                            {table.name}
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--mk-ink-500)' }}>
                            {table.capacity}p
                          </span>
                          <span
                            style={{
                              position: 'absolute',
                              top: 4,
                              right: 4,
                              width: 5,
                              height: 5,
                              borderRadius: 999,
                              background: s.dot,
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                    {Object.entries(TABLE_STATUS_CONFIG)
                      .slice(0, 4)
                      .map(([k, v]) => (
                        <div
                          key={k}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 11.5,
                            color: 'var(--mk-ink-600)',
                          }}
                        >
                          <span
                            style={{ width: 7, height: 7, borderRadius: 999, background: v.dot }}
                          />
                          {v.label}
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Menu preview + QR */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          {/* Menu items */}
          <div
            style={{
              background: 'white',
              border: '1px solid var(--mk-ink-100)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-xs)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 22px 16px',
                borderBottom: '1px solid var(--mk-ink-100)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  Menu
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--mk-ink-500)' }}>
                  {items.length} item{items.length !== 1 ? 's' : ''} · {categories.length} categor
                  {categories.length !== 1 ? 'ies' : 'y'}
                </p>
              </div>
              {canEditMenu ? (
                <Link href="/admin/menu" style={{ textDecoration: 'none' }}>
                  <button
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 30,
                      padding: '0 12px',
                      fontSize: 12.5,
                      fontWeight: 500,
                      borderRadius: 8,
                      background: 'white',
                      color: 'var(--mk-ink-950)',
                      border: '1px solid var(--mk-ink-200)',
                      boxShadow: 'var(--shadow-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    Manage <ArrowIcon />
                  </button>
                </Link>
              ) : null}
            </div>
            <div style={{ padding: '6px 22px 18px' }}>
              {items.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    marginTop: 8,
                    border: '1.5px dashed var(--mk-ink-200)',
                    borderRadius: 12,
                  }}
                >
                  <p style={{ fontSize: 13, color: 'var(--mk-ink-500)', margin: '0 0 10px' }}>
                    You haven&apos;t added any menu items yet.
                  </p>
                  {canEditMenu ? (
                    <Link href="/onboarding/menu" style={{ textDecoration: 'none' }}>
                      <button
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 30,
                          padding: '0 12px',
                          fontSize: 12.5,
                          fontWeight: 500,
                          borderRadius: 8,
                          background: 'var(--mk-ink-950)',
                          color: 'var(--mk-canvas-50)',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Set up your menu
                      </button>
                    </Link>
                  ) : null}
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {items.slice(0, 7).map((item, i) => {
                    const category = categories.find(
                      (c) => String(c._id) === String(item.categoryId),
                    );
                    return (
                      <li
                        key={String(item._id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '11px 0',
                          borderBottom:
                            i < Math.min(items.length, 7) - 1
                              ? '1px solid var(--mk-ink-100)'
                              : 'none',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{ fontSize: 13, fontWeight: 500, color: 'var(--mk-ink-950)' }}
                          >
                            {item.name}
                          </div>
                          {category ? (
                            <div style={{ fontSize: 11.5, color: 'var(--mk-ink-500)' }}>
                              {category.name}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {item.soldOut ? (
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 600,
                                padding: '2px 8px',
                                background: 'var(--mk-rose-50)',
                                color: 'var(--mk-rose-700)',
                                borderRadius: 999,
                              }}
                            >
                              Sold out
                            </span>
                          ) : null}
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 13,
                              fontWeight: 600,
                              fontVariantNumeric: 'tabular-nums',
                              color: 'var(--mk-ink-950)',
                            }}
                          >
                            {formatMoney(item.priceMinor, currency, locale)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                  {items.length > 7 ? (
                    <li style={{ paddingTop: 12, textAlign: 'center' }}>
                      <Link
                        href="/admin/menu"
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--mk-saffron-700)',
                          textDecoration: 'underline',
                          textUnderlineOffset: 4,
                        }}
                      >
                        View all {items.length} items →
                      </Link>
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
          </div>

          {/* Restaurant profile + QR */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Profile snippet */}
            <div
              style={{
                background: 'white',
                border: '1px solid var(--mk-ink-100)',
                borderRadius: 14,
                boxShadow: 'var(--shadow-xs)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--mk-ink-100)' }}
              >
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  Restaurant profile
                </h3>
              </div>
              <div style={{ padding: '6px 22px 18px' }}>
                {[
                  { label: 'Slug', value: restaurant?.slug, mono: true },
                  { label: 'Currency', value: restaurant?.currency, mono: true },
                  { label: 'Timezone', value: restaurant?.timezone, mono: true },
                  { label: 'Plan', value: restaurant?.subscriptionStatus ?? 'trial', badge: true },
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '9px 0',
                      borderBottom: '1px solid var(--mk-ink-100)',
                    }}
                  >
                    <dt
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--mk-ink-400)',
                      }}
                    >
                      {row.label}
                    </dt>
                    <dd style={{ margin: 0 }}>
                      {row.badge ? (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            padding: '2px 8px',
                            background: 'var(--mk-jade-50)',
                            color: 'var(--mk-jade-700)',
                            borderRadius: 999,
                          }}
                        >
                          {row.value}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: row.mono ? 11.5 : 13,
                            fontFamily: row.mono ? 'var(--font-mono)' : undefined,
                            color: 'var(--mk-ink-950)',
                          }}
                        >
                          {row.value}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </div>
            </div>

            {firstTable && canPrintQr ? (
              <div
                style={{
                  background: 'white',
                  border: '1px solid var(--mk-ink-100)',
                  borderRadius: 14,
                  boxShadow: 'var(--shadow-xs)',
                  padding: '18px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: 'var(--mk-ink-400)',
                    alignSelf: 'flex-start',
                  }}
                >
                  QR code
                </div>
                <div
                  style={{
                    padding: 8,
                    background: 'white',
                    border: '1px solid var(--mk-ink-100)',
                    borderRadius: 12,
                  }}
                >
                  <QRCodeSVG
                    value={`https://${slug}.menukaze.com/t/${firstTable.qrToken}`}
                    size={112}
                    level="M"
                    fgColor="var(--mk-ink-950)"
                  />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    color: 'var(--mk-ink-600)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {firstTable.name}
                </div>
                <Link href="/admin/tables/print" style={{ textDecoration: 'none' }}>
                  <button
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 30,
                      padding: '0 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 8,
                      background: 'transparent',
                      color: 'var(--mk-saffron-700)',
                      border: 'none',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                    }}
                  >
                    Print all QRs
                  </button>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Stat card with inline sparkline ─── */
function StatCard({
  label,
  value,
  sublabel,
  sparkline,
  accentColor,
}: {
  label: string;
  value: string;
  sublabel?: string;
  sparkline?: number[];
  accentColor?: string;
}) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--mk-ink-100)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-xs)',
        padding: 18,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--mk-ink-500)',
          }}
        >
          {label}
        </div>
        {accentColor && (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 8,
              background: accentColor,
              opacity: 0.18,
            }}
          />
        )}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: '-0.025em',
          lineHeight: 1,
          marginTop: 10,
          color: 'var(--mk-ink-950)',
          fontFeatureSettings: "'tnum','zero'",
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {sublabel && (
        <div style={{ fontSize: 12, color: 'var(--mk-ink-500)', marginTop: 6 }}>{sublabel}</div>
      )}
      {sparkline && sparkline.length > 0 && (
        <div style={{ marginTop: 14, height: 36 }}>
          <Sparkline data={sparkline} color={accentColor ?? 'var(--mk-ink-950)'} />
        </div>
      )}
    </div>
  );
}

/* ─── SVG Sparkline ─── */
function Sparkline({ data, color = 'var(--mk-ink-950)' }: { data: number[]; color?: string }) {
  if (!data || data.length === 0) return null;
  const W = 220;
  const H = 40;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = W / (data.length - 1);
  const points = data.map(
    (v, i) => [i * step, H - ((v - min) / range) * (H - 4) - 2] as [number, number],
  );
  const path = points
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(' ');
  const area = `${path} L ${W} ${H} L 0 ${H} Z`;
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─── Revenue chart ─── */
function RevenueChart({
  current,
  previous,
  labels,
  currency,
  locale,
}: {
  current: number[];
  previous: number[];
  labels: string[];
  currency: ReturnType<typeof currencyCodeOrDefault>;
  locale: string;
}) {
  const currentTotal = current.reduce((sum, value) => sum + value, 0);
  const previousTotal = previous.reduce((sum, value) => sum + value, 0);
  const hasData = currentTotal > 0 || previousTotal > 0;
  const trendLabel =
    currentTotal === 0 && previousTotal === 0
      ? 'No orders in window'
      : previousTotal === 0
        ? 'New activity'
        : `${currentTotal >= previousTotal ? '+' : '-'}${Math.round(Math.abs((currentTotal - previousTotal) / previousTotal) * 100)}%`;
  const max = Math.max(...current, ...previous, 1) * 1.08;
  const W = 800;
  const H = 160;
  const step = W / (Math.max(current.length, 2) - 1);
  const toY = (v: number) => H - (v / max) * (H - 24) - 8;
  const pathFor = (d: number[]) =>
    d.map((v, i) => (i === 0 ? `M ${i * step} ${toY(v)}` : `L ${i * step} ${toY(v)}`)).join(' ');
  const areaFor = (d: number[]) => `${pathFor(d)} L ${W} ${H} L 0 ${H} Z`;

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--mk-ink-500)',
            }}
          >
            Today
          </div>
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              marginTop: 2,
              color: 'var(--mk-ink-950)',
            }}
          >
            {formatMoney(currentTotal, currency, locale)}
          </div>
          <div style={{ marginTop: 2, fontSize: 12, color: 'var(--mk-ink-500)' }}>{trendLabel}</div>
        </div>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 11.5,
            color: 'var(--mk-ink-500)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{ width: 14, height: 2, background: 'var(--mk-ink-950)', borderRadius: 99 }}
            />
            Today
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 14,
                height: 2,
                borderTop: '2px dashed var(--mk-ink-400)',
                display: 'block',
              }}
            />
            Yesterday
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 160 }}
      >
        <defs>
          <linearGradient id="rev-grad-home" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mk-saffron-400)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--mk-saffron-400)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1="0"
            y1={(H - 24) * (i / 3) + 8}
            x2={W}
            y2={(H - 24) * (i / 3) + 8}
            stroke="var(--mk-ink-100)"
            strokeDasharray="2 4"
          />
        ))}
        {hasData ? (
          <>
            <path d={areaFor(current)} fill="url(#rev-grad-home)" />
            <path
              d={pathFor(previous)}
              fill="none"
              stroke="var(--mk-ink-400)"
              strokeWidth="1.5"
              strokeDasharray="3 4"
            />
            <path
              d={pathFor(current)}
              fill="none"
              stroke="var(--mk-ink-950)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={step * (current.length - 1)}
              cy={toY(current.at(-1) ?? 0)}
              r="4"
              fill="var(--mk-saffron-500)"
              stroke="white"
              strokeWidth="2"
            />
          </>
        ) : (
          <text
            x={W / 2}
            y={H / 2}
            textAnchor="middle"
            fill="var(--mk-ink-400)"
            style={{ fontSize: 13 }}
          >
            No order data yet
          </text>
        )}
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 10.5,
          color: 'var(--mk-ink-400)',
        }}
      >
        {labels.map((t, index) => (
          <span key={`${t}-${index}`}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      style={{ width: 12, height: 12 }}
      aria-hidden
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return 'Still open';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Late service';
}
