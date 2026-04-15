import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { ReservationSettingsForm } from './reservation-settings-form';

export const dynamic = 'force-dynamic';

export default async function ReservationSettingsPage() {
  const { restaurantId } = await requirePageFlag(['reservations.configure']);
  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) notFound();

  const settings = restaurant.reservationSettings ?? {
    enabled: false,
    slotMinutes: 60,
    maxPartySize: 8,
    bufferMinutes: 0,
    autoConfirm: true,
    reminderHours: 24,
    blockedDates: [],
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reservation settings</h1>
          <p className="text-muted-foreground text-sm">
            Slot length, party size cap, blocked dates, and approval mode.
          </p>
        </div>
        <Link
          href="/admin/reservations"
          className="text-foreground text-sm underline underline-offset-4"
        >
          ← Back
        </Link>
      </header>

      <ReservationSettingsForm
        initial={{
          enabled: settings.enabled,
          slotMinutes: settings.slotMinutes,
          maxPartySize: settings.maxPartySize,
          bufferMinutes: settings.bufferMinutes,
          autoConfirm: settings.autoConfirm,
          reminderHours: settings.reminderHours,
          blockedDates: settings.blockedDates,
        }}
      />
    </main>
  );
}
