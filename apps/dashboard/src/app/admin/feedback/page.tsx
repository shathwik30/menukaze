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
    <div>
      <div
        style={{
          padding: '28px 40px 24px',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--mk-saffron-700)',
              marginBottom: 8,
            }}
          >
            Guest experience
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: 'var(--mk-ink-950)',
            }}
          >
            Feedback
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)' }}>
            {total > 0
              ? `Average ${weighted.toFixed(2)} from ${total} review${total === 1 ? '' : 's'}.`
              : 'No reviews yet — they appear after an order is marked ready.'}
          </p>
        </div>
        <Link
          href="/admin"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--mk-ink-500)',
            textDecoration: 'none',
          }}
        >
          ← Back
        </Link>
      </div>

      <div style={{ padding: '24px 40px 48px', maxWidth: 720 }}>
        {total > 0 ? (
          <div
            style={{
              background: 'white',
              border: '1px solid var(--mk-ink-100)',
              borderRadius: 14,
              padding: '20px 24px',
              marginBottom: 24,
              boxShadow: 'var(--shadow-xs)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = counts[rating] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div
                  key={rating}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}
                >
                  <span style={{ width: 32, color: 'var(--mk-saffron-500)', fontSize: 12 }}>
                    {'★'.repeat(rating)}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 99,
                      background: 'var(--mk-canvas-200)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        background: 'var(--mk-saffron-400)',
                        borderRadius: 99,
                        width: `${pct}%`,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      width: 56,
                      textAlign: 'right',
                      fontSize: 12,
                      color: 'var(--mk-ink-400)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {count} · {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {recent.length > 0 ? (
          <div>
            <h2
              style={{
                margin: '0 0 12px',
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--mk-ink-500)',
              }}
            >
              Latest reviews
            </h2>
            <div
              style={{
                background: 'white',
                border: '1px solid var(--mk-ink-100)',
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              {recent.map((entry) => (
                <div
                  key={String(entry._id)}
                  style={{ padding: '14px 20px', borderBottom: '1px solid var(--mk-ink-100)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: 'var(--mk-saffron-500)' }}>
                      {'★'.repeat(entry.rating)}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: 'var(--mk-ink-400)',
                      }}
                    >
                      {publicOrderIdById.get(String(entry.orderId)) ?? entry.orderId.toString()}
                    </span>
                    <span
                      style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--mk-ink-400)' }}
                    >
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.comment ? (
                    <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--mk-ink-800)' }}>
                      {entry.comment}
                    </p>
                  ) : null}
                  {entry.customerName ? (
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: 12,
                        color: 'var(--mk-ink-400)',
                        fontStyle: 'italic',
                      }}
                    >
                      — {entry.customerName}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
