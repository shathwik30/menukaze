import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { StartSessionForm } from './start-form';

export const dynamic = 'force-dynamic';

/**
 * QR landing. The QR token selects the table and tenant, then existing active
 * sessions short-circuit to the shared session page.
 */
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
  if (!restaurant || !restaurant.liveAt) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-2xl font-bold">{restaurant?.name ?? 'Restaurant'}</h1>
        <p className="text-muted-foreground text-sm">
          This restaurant isn&apos;t accepting dine-in orders right now.
        </p>
      </main>
    );
  }

  // Concurrent scans should join the same active table session.
  const existing = await TableSession.findOne({
    restaurantId: table.restaurantId,
    tableId: table._id,
    status: { $in: ['active', 'bill_requested'] },
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
        </p>
      </header>

      <StartSessionForm qrToken={qrToken} />
    </main>
  );
}
