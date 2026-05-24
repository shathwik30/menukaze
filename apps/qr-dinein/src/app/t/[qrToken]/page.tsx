import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { getRestaurantOpenStatus } from '@menukaze/shared';
import { StartSessionForm } from './start-form';

export const dynamic = 'force-dynamic';

export default async function TableLandingPage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;

  const conn = await getMongoConnection('live');
  const { Table, Restaurant, TableSession } = getModels(conn);

  const table = await Table.findOne({ qrToken }, null, { skipTenantGuard: true }).exec();
  if (!table) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-2xl font-bold">Table not found</h1>
        <p className="text-muted-foreground text-sm">
          The QR sticker on this table is no longer valid. Please ask a staff member.
        </p>
      </main>
    );
  }

  const restaurant = await Restaurant.findById(table.restaurantId).exec();

  if (!restaurant?.liveAt) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-2xl font-bold">{restaurant?.name ?? 'Restaurant'}</h1>
        <p className="text-muted-foreground text-sm">
          This restaurant isn&apos;t accepting dine-in orders right now.
        </p>
      </main>
    );
  }

  // Holiday mode — owner manually closed ordering across all channels.
  if (restaurant.holidayMode?.enabled) {
    return (
      <ClosedScreen
        restaurantName={restaurant.name}
        message={restaurant.holidayMode.message ?? "We're closed right now. See you soon!"}
      />
    );
  }

  // QR ordering paused — staff temporarily stopped new dine-in sessions.
  if (restaurant.qrOrderingPaused) {
    return (
      <ClosedScreen
        restaurantName={restaurant.name}
        message="We're not accepting new table orders right now. Please ask a staff member for assistance."
      />
    );
  }

  // Operating hours — scheduled close.
  const openStatus = getRestaurantOpenStatus(restaurant.hours, restaurant.timezone);
  if (!openStatus.isOpen) {
    const message = openStatus.opensAt
      ? `We open today at ${openStatus.opensAt}.`
      : "We're closed for today. See you next time!";
    return <ClosedScreen restaurantName={restaurant.name} message={message} />;
  }

  // Redirect to an existing active session for this table (including needs_review
  // so the customer lands on their session instead of seeing the start form).
  const existing = await TableSession.findOne({
    restaurantId: table.restaurantId,
    tableId: table._id,
    status: { $in: ['active', 'bill_requested', 'needs_review'] },
  }).exec();
  if (existing) {
    redirect(`/session/${String(existing._id)}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold">{restaurant.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {table.name} · Seats {table.capacity}
          {openStatus.closesAt ? ` · Open until ${openStatus.closesAt}` : ''}
        </p>
      </header>

      <StartSessionForm
        qrToken={qrToken}
        geolocationEnabled={restaurant.geolocationRestriction?.enabled ?? false}
        restaurantLocation={{
          lat: restaurant.geo.coordinates[1],
          lng: restaurant.geo.coordinates[0],
        }}
        radiusKm={restaurant.geolocationRestriction?.radiusKm ?? 5}
      />
    </main>
  );
}

function ClosedScreen({ restaurantName, message }: { restaurantName: string; message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-4xl">🔒</div>
      <h1 className="text-2xl font-bold">{restaurantName}</h1>
      <p className="text-muted-foreground text-sm">{message}</p>
    </main>
  );
}
