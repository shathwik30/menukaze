import { Types } from 'mongoose';
import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireOnboarded } from '@/lib/session';
import { KdsBoard, type KdsCard } from './kds-board';

export const dynamic = 'force-dynamic';

/**
 * Single-station KDS (kitchen display system). Loads every open order
 * (not terminal, not ready for pickup) and hands them to the client
 * component for real-time updates + tap-through status transitions.
 */
export default async function KdsPage() {
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const conn = await getMongoConnection('live');
  const { Restaurant, Order } = getModels(conn);

  const [restaurant, orders] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Order.find({
      restaurantId,
      status: { $in: ['received', 'confirmed', 'preparing', 'ready'] },
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec(),
  ]);

  const cards: KdsCard[] = orders.map((o) => ({
    id: String(o._id),
    publicOrderId: o.publicOrderId,
    channel: o.channel,
    type: o.type,
    status: o.status,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
    items: o.items.map((item) => ({
      quantity: item.quantity,
      name: item.name,
      modifiers: item.modifiers.map((m) => m.optionName),
      notes: item.notes,
    })),
    tableId: o.tableId ? String(o.tableId) : undefined,
  }));

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kitchen Display</h1>
          <p className="text-muted-foreground text-sm">{restaurant?.name}</p>
        </div>
        <Link href="/admin" className="border-input text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      <KdsBoard restaurantId={session.restaurantId} initialCards={cards} />
    </main>
  );
}
