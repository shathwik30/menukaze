import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { formatMoney, parseCurrencyCode } from '@menukaze/shared';
import { BillClient, type BillLine } from './bill-client';

export const dynamic = 'force-dynamic';

export default async function BillPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const sessionObjectId = parseObjectId(sessionId);
  if (!sessionObjectId) notFound();

  const conn = await getMongoConnection('live');
  const { TableSession, Order, Restaurant } = getModels(conn);

  const session = await TableSession.findOne({ _id: sessionObjectId }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!session) notFound();
  if (session.status === 'closed') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-2xl font-bold">Session closed</h1>
        <p className="text-muted-foreground text-sm">This dine-in session has already been paid.</p>
      </main>
    );
  }

  const restaurant = await Restaurant.findById(session.restaurantId).exec();
  if (!restaurant) notFound();

  const rounds = await Order.find({
    restaurantId: session.restaurantId,
    sessionId: session._id,
  })
    .sort({ createdAt: 1 })
    .lean()
    .exec();
  if (rounds.length === 0) {
    redirect(`/session/${sessionId}`);
  }

  const currency = parseCurrencyCode(restaurant.currency);
  const locale = restaurant.locale;

  const lines: BillLine[] = rounds.flatMap((round) =>
    round.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      lineTotalLabel: formatMoney(item.lineTotalMinor, currency, locale),
    })),
  );
  const totalMinor = rounds.reduce((s, o) => s + o.totalMinor, 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-4 sm:p-6">
      <header>
        <Link href={`/session/${sessionId}`} className="text-muted-foreground text-xs underline">
          ← Back to menu
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Bill</h1>
        <p className="text-muted-foreground text-sm">{restaurant.name}</p>
      </header>

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Itemized</h2>
        <ul className="divide-border mt-3 divide-y text-sm">
          {lines.map((line, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                {line.quantity}× {line.name}
              </span>
              <span className="text-foreground shrink-0 font-mono text-xs">
                {line.lineTotalLabel}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
          <span className="text-sm font-semibold">Total</span>
          <span className="font-mono text-base font-semibold">
            {formatMoney(totalMinor, currency, locale)}
          </span>
        </div>
      </section>

      <BillClient
        restaurantId={String(session.restaurantId)}
        sessionId={sessionId}
        status={session.status}
        paymentModeRequested={session.paymentModeRequested}
        restaurantName={restaurant.name}
        totalLabel={formatMoney(totalMinor, currency, locale)}
      />
    </main>
  );
}
