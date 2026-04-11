import { Types } from 'mongoose';
import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireOnboarded } from '@/lib/session';
import { TablesManager, type ManagerTable } from './tables-manager';

export const dynamic = 'force-dynamic';

export default async function TablesPage() {
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const conn = await getMongoConnection('live');
  const { Restaurant, Table } = getModels(conn);
  const [restaurant, tables] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Table.find({ restaurantId }).sort({ number: 1 }).lean().exec(),
  ]);

  const slug = restaurant?.slug ?? 'demo';
  const rows: ManagerTable[] = tables.map((t) => ({
    id: String(t._id),
    number: t.number,
    name: t.name,
    capacity: t.capacity,
    zone: t.zone,
    qrToken: t.qrToken,
    status: t.status,
    qrUrl: `https://${slug}.menukaze.com/t/${t.qrToken}`,
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tables</h1>
          <p className="text-muted-foreground text-sm">
            Dine-in tables and QR codes for {restaurant?.name}
          </p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      <TablesManager tables={rows} />
    </main>
  );
}
