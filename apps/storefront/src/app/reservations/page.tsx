import type { Metadata } from 'next';
import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { ReservationForm } from './reservation-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const restaurant = await resolveTenantOrNotFound();
    return {
      title: `Reservations · ${restaurant.name}`,
      description: `Book a table at ${restaurant.name}.`,
      robots: { index: true, follow: true },
    };
  } catch {
    return { title: 'Reservations' };
  }
}

export default async function ReservationsPage() {
  const restaurant = await resolveTenantOrNotFound();
  const settings = restaurant.reservationSettings;

  if (!settings?.enabled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">{restaurant.name}</h1>
        <p className="text-muted-foreground">
          {restaurant.name} is not taking online reservations right now. Please contact the
          restaurant directly.
        </p>
        <Link href="/" className="text-foreground underline">
          ← Back to menu
        </Link>
      </main>
    );
  }

  const conn = await getMongoConnection('live');
  const { Reservation } = getModels(conn);

  const today = new Date();
  const horizonDays = 30;
  const dates: string[] = [];
  for (let i = 0; i < horizonDays; i += 1) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().slice(0, 10));
  }

  const startDate = dates[0]!;
  const endDate = dates[dates.length - 1]!;
  const bookings = await Reservation.find(
    {
      restaurantId: restaurant._id,
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ['pending', 'confirmed', 'seated', 'completed'] },
    },
    { date: 1, slotStart: 1, slotEnd: 1, partySize: 1, status: 1 },
  )
    .lean()
    .exec();

  const bookingPayload = bookings.map((b) => ({
    date: b.date,
    slotStart: b.slotStart,
    slotEnd: b.slotEnd,
    partySize: b.partySize,
    status: b.status,
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-8">
      <header>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">Book a table</p>
        <h1 className="text-3xl font-bold">{restaurant.name}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Reservations of up to {settings.maxPartySize} guests. Each slot is {settings.slotMinutes}{' '}
          minutes.
          {settings.autoConfirm
            ? ' Bookings are confirmed instantly.'
            : ' The restaurant reviews each request and will confirm by email.'}
        </p>
      </header>

      <ReservationForm
        restaurantId={String(restaurant._id)}
        restaurantName={restaurant.name}
        availableDates={dates}
        bookings={bookingPayload}
        hours={restaurant.hours.map((h) => ({
          day: h.day,
          closed: h.closed,
          ...(h.open ? { open: h.open } : {}),
          ...(h.close ? { close: h.close } : {}),
        }))}
        settings={{
          enabled: settings.enabled,
          slotMinutes: settings.slotMinutes,
          maxPartySize: settings.maxPartySize,
          bufferMinutes: settings.bufferMinutes,
          autoConfirm: settings.autoConfirm,
          reminderHours: settings.reminderHours,
          blockedDates: settings.blockedDates,
        }}
      />

      <Link href="/" className="text-foreground text-sm underline">
        ← Back to menu
      </Link>
    </main>
  );
}
