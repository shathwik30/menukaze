import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function FeedbackPage() {
  const { restaurantId } = await requirePageFlag(['analytics.view']);

  const conn = await getMongoConnection('live');
  const { Feedback, Order } = getModels(conn);

  const [aggregate, recent] = await Promise.all([
    Feedback.aggregate([
      { $match: { restaurantId } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 },
        },
      },
    ]).exec() as Promise<Array<{ _id: number; count: number }>>,
    Feedback.find({ restaurantId }).sort({ createdAt: -1 }).limit(50).lean().exec(),
  ]);

  const orderIds = Array.from(new Set(recent.map((r) => String(r.orderId))));
  const orders =
    orderIds.length > 0
      ? await Order.find({ restaurantId, _id: { $in: orderIds } }, { publicOrderId: 1 })
          .lean()
          .exec()
      : [];
  const publicOrderIdById = new Map(orders.map((o) => [String(o._id), o.publicOrderId]));

  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of aggregate) counts[row._id] = row.count;
  const total = (Object.values(counts) as number[]).reduce((sum, n) => sum + n, 0);
  const weighted =
    total === 0
      ? 0
      : (Object.entries(counts) as [string, number][]).reduce(
          (sum, [rating, count]) => sum + Number(rating) * count,
          0,
        ) / total;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customer feedback</h1>
          <p className="text-muted-foreground text-sm">
            {total > 0
              ? `Average ${weighted.toFixed(2)} from ${total} review${total === 1 ? '' : 's'}.`
              : 'No reviews yet — they appear after an order is marked ready.'}
          </p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      {total > 0 ? (
        <section className="border-border space-y-2 rounded-md border p-4">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = counts[rating] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={rating} className="flex items-center gap-3 text-sm">
                <span className="w-8 text-amber-500">{'★'.repeat(rating)}</span>
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-muted-foreground w-12 text-right text-xs">
                  {count} · {pct}%
                </span>
              </div>
            );
          })}
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Latest reviews</h2>
          <ul className="border-border divide-border divide-y rounded-md border">
            {recent.map((entry) => (
              <li key={String(entry._id)} className="flex flex-col gap-1 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-amber-500">{'★'.repeat(entry.rating)}</span>
                  <span className="text-muted-foreground text-xs">
                    {publicOrderIdById.get(String(entry.orderId)) ?? entry.orderId.toString()}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                {entry.comment ? <p className="text-sm">{entry.comment}</p> : null}
                {entry.customerName ? (
                  <p className="text-muted-foreground text-xs">— {entry.customerName}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
