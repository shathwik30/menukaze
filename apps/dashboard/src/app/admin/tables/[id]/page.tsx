import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { currencyCodeOrDefault, formatMoney, startOfTodayInTimezone } from '@menukaze/shared';
import { Badge, Card, CardContent, CardHeader, CardTitle, Eyebrow } from '@menukaze/ui';
import { requirePageFlag } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ACTIVE_SESSION_STATUSES = ['active', 'bill_requested', 'needs_review'];
const ACTIVE_ORDER_STATUSES = ['received', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];

export default async function TableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { restaurantId } = await requirePageFlag(['tables.view']);
  const { id } = await params;
  const tableId = parseObjectId(id);
  if (!tableId) notFound();

  const conn = await getMongoConnection('live');
  const { Restaurant, Table, TableSession, Order, Reservation } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId, {
    currency: 1,
    locale: 1,
    timezone: 1,
    slug: 1,
  })
    .lean()
    .exec();
  const table = await Table.findOne({ restaurantId, _id: tableId }).lean().exec();
  if (!table) notFound();

  const locale = restaurant?.locale ?? 'en-US';
  const timezone = restaurant?.timezone;
  const todayStart = startOfTodayInTimezone(timezone);

  const [activeSession, liveOrders, recentOrders, todayReservations] = await Promise.all([
    TableSession.findOne({
      restaurantId,
      tableId,
      status: { $in: ACTIVE_SESSION_STATUSES },
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec(),
    Order.find(
      { restaurantId, tableId, status: { $in: ACTIVE_ORDER_STATUSES } },
      {
        publicOrderId: 1,
        pickupNumber: 1,
        status: 1,
        totalMinor: 1,
        currency: 1,
        createdAt: 1,
        'customer.name': 1,
      },
    )
      .sort({ createdAt: -1 })
      .limit(25)
      .lean()
      .exec(),
    Order.find(
      { restaurantId, tableId },
      {
        publicOrderId: 1,
        pickupNumber: 1,
        status: 1,
        totalMinor: 1,
        currency: 1,
        createdAt: 1,
      },
    )
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .exec(),
    Reservation.find(
      {
        restaurantId,
        date: new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone ?? 'UTC',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(todayStart),
      },
      {
        name: 1,
        partySize: 1,
        slotStart: 1,
        slotEnd: 1,
        status: 1,
      },
    )
      .sort({ slotStart: 1 })
      .limit(25)
      .lean()
      .exec(),
  ]);

  const slug = restaurant?.slug ?? 'demo';
  const qrUrl = `https://${slug}.menukaze.com/t/${table.qrToken}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow withBar tone="accent">
            Table #{table.number}
          </Eyebrow>
          <h1 className="text-foreground mt-2 font-serif text-3xl font-medium tracking-tight">
            {table.name}
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">
            Seats {table.capacity}
            {table.zone ? ` · ${table.zone}` : ''} · Status{' '}
            <span className="capitalize">{table.status.replace('_', ' ')}</span>
          </p>
        </div>
        <Link href="/admin/tables" className="text-sm underline underline-offset-4">
          ← All tables
        </Link>
      </header>

      <Card variant="surface" radius="lg">
        <CardHeader>
          <CardTitle>Current session</CardTitle>
        </CardHeader>
        <CardContent>
          {activeSession ? (
            <div className="space-y-1 text-sm">
              <p>
                <strong>{activeSession.customer?.name ?? 'Guest'}</strong>
                {activeSession.customer?.email ? (
                  <span className="text-ink-500"> · {activeSession.customer.email}</span>
                ) : null}
              </p>
              <p className="text-ink-500 dark:text-ink-400">
                Opened {new Date(activeSession.createdAt).toLocaleString(locale)}
              </p>
              <p className="text-ink-500 dark:text-ink-400 capitalize">
                Status: {activeSession.status.replace('_', ' ')}
              </p>
            </div>
          ) : (
            <p className="text-ink-500 text-sm">No active dining session.</p>
          )}
        </CardContent>
      </Card>

      <Card variant="surface" radius="lg">
        <CardHeader>
          <CardTitle>Live orders on this table</CardTitle>
        </CardHeader>
        <CardContent>
          {liveOrders.length === 0 ? (
            <p className="text-ink-500 text-sm">No orders in progress.</p>
          ) : (
            <ul className="divide-ink-100 dark:divide-ink-800 divide-y text-sm">
              {liveOrders.map((o) => (
                <li key={String(o._id)} className="flex items-center gap-3 py-2">
                  <span className="font-mono text-xs">
                    {o.pickupNumber ? `#${o.pickupNumber}` : o.publicOrderId}
                  </span>
                  <span className="text-ink-500 text-xs capitalize">
                    {o.status.replace('_', ' ')}
                  </span>
                  <span className="text-ink-500 ml-auto text-xs">
                    {new Date(o.createdAt).toLocaleTimeString(locale)}
                  </span>
                  <span className="font-mono text-xs">
                    {formatMoney(o.totalMinor, currencyCodeOrDefault(o.currency), locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card variant="surface" radius="lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Today&apos;s reservations</CardTitle>
            <Badge variant="subtle" size="xs" shape="pill">
              {todayReservations.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {todayReservations.length === 0 ? (
            <p className="text-ink-500 text-sm">No reservations booked for today.</p>
          ) : (
            <ul className="divide-ink-100 dark:divide-ink-800 divide-y text-sm">
              {todayReservations.map((r) => (
                <li key={String(r._id)} className="flex items-center gap-3 py-2">
                  <span className="font-mono text-xs">
                    {r.slotStart}–{r.slotEnd}
                  </span>
                  <span>{r.name}</span>
                  <span className="text-ink-500 text-xs">party of {r.partySize}</span>
                  <span className="text-ink-500 ml-auto text-xs capitalize">
                    {r.status.replace('_', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card variant="surface" radius="lg">
        <CardHeader>
          <CardTitle>Recent order history</CardTitle>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="text-ink-500 text-sm">No past orders.</p>
          ) : (
            <ul className="divide-ink-100 dark:divide-ink-800 divide-y text-sm">
              {recentOrders.map((o) => (
                <li key={String(o._id)} className="flex items-center gap-3 py-2">
                  <span className="font-mono text-xs">{o.publicOrderId}</span>
                  <span className="text-ink-500 text-xs capitalize">
                    {o.status.replace('_', ' ')}
                  </span>
                  <span className="text-ink-500 ml-auto text-xs">
                    {new Date(o.createdAt).toLocaleString(locale)}
                  </span>
                  <span className="font-mono text-xs">
                    {formatMoney(o.totalMinor, currencyCodeOrDefault(o.currency), locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card variant="surface" radius="lg">
        <CardHeader>
          <CardTitle>QR code</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-ink-500 dark:text-ink-400 font-mono text-xs break-all">{qrUrl}</p>
        </CardContent>
      </Card>
    </main>
  );
}
