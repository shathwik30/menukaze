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
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reservations</h1>
          <p className="text-muted-foreground text-sm">
            {restaurant.reservationSettings?.enabled
              ? 'Online bookings are open.'
              : 'Online bookings are turned off — turn them on in settings.'}
          </p>
        </div>
        <div className="flex gap-2">
          {permissions.includes('reservations.configure') ? (
            <Link
              href="/admin/reservations/settings"
              className="border-input hover:bg-accent inline-flex h-9 items-center rounded-md border px-3 text-sm"
            >
              Settings
            </Link>
          ) : null}
          <Link
            href="/admin"
            className="text-foreground inline-flex h-9 items-center text-sm underline underline-offset-4"
          >
            ← Back
          </Link>
        </div>
      </header>

      <ReservationsBoard reservations={all} canEdit={permissions.includes('reservations.edit')} />
    </main>
  );
}
