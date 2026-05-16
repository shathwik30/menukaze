import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { ReservationsBoard } from './reservations-board';

export const dynamic = 'force-dynamic';

export default async function DashboardReservationsPage() {
  const { restaurantId, permissions } = await requirePageFlag(['reservations.view']);

  const conn = await getMongoConnection('live');
  const { Restaurant, Reservation } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await Reservation.find({
    restaurantId,
    date: { $gte: today },
  })
    .sort({ date: 1, slotStart: 1 })
    .limit(200)
    .lean()
    .exec();
  const past = await Reservation.find({ restaurantId, date: { $lt: today } })
    .sort({ date: -1, slotStart: -1 })
    .limit(50)
    .lean()
    .exec();

  const all = [...upcoming, ...past].map((r) => ({
    id: String(r._id),
    name: r.name,
    email: r.email,
    phone: r.phone ?? null,
    partySize: r.partySize,
    date: r.date,
    slotStart: r.slotStart,
    slotEnd: r.slotEnd,
    notes: r.notes ?? null,
    status: r.status,
    autoConfirmed: r.autoConfirmed,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
  }));

  return (
    <div>
      <div
        style={{
          padding: '14px 40px 12px',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 3,
              height: 28,
              borderRadius: 99,
              background: 'var(--mk-saffron-500)',
              flexShrink: 0,
            }}
          />
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--mk-saffron-700)',
              }}
            >
              Bookings
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif)',
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: 'var(--mk-ink-950)',
                lineHeight: 1.2,
              }}
            >
              Reservations
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!restaurant.reservationSettings?.enabled ? (
            <span
              style={{
                fontSize: 12,
                color: 'var(--mk-rose-700)',
                background: 'var(--mk-rose-50)',
                padding: '3px 10px',
                borderRadius: 6,
                fontWeight: 500,
              }}
            >
              Bookings off
            </span>
          ) : null}
          {permissions.includes('reservations.configure') ? (
            <Link
              href="/admin/reservations/settings"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 32,
                padding: '0 12px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 500,
                textDecoration: 'none',
                border: '1px solid var(--mk-ink-200)',
                color: 'var(--mk-ink-700)',
              }}
            >
              Settings
            </Link>
          ) : null}
        </div>
      </div>
      <div style={{ padding: '14px 40px 48px' }}>
        <ReservationsBoard reservations={all} canEdit={permissions.includes('reservations.edit')} />
      </div>
    </div>
  );
}
