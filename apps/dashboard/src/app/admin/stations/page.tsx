import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { StationsManager } from './stations-manager';

export const dynamic = 'force-dynamic';

export default async function StationsPage() {
  const { restaurantId } = await requirePageFlag(['kds.configure']);
  const conn = await getMongoConnection('live');
  const { Station } = getModels(conn);
  const stations = await Station.find({ restaurantId, archived: false })
    .sort({ order: 1 })
    .lean()
    .exec();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">KDS stations</h1>
          <p className="text-muted-foreground text-sm">
            Run multiple kitchen display screens (grill, fry, drinks). Items inherit station routing
            from their category, or override per item from the menu editor.
          </p>
        </div>
        <Link href="/admin/kds" className="text-foreground text-sm underline underline-offset-4">
          ← Back to KDS
        </Link>
      </header>

      <StationsManager
        initial={stations.map((s) => ({
          id: String(s._id),
          name: s.name,
          color: s.color ?? '',
          soundEnabled: s.soundEnabled,
        }))}
      />
    </main>
  );
}
