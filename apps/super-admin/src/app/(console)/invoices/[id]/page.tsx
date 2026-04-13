import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { requireSuperAdmin } from '@/lib/session';
import { cn } from '@menukaze/ui';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;
  const oid = parseObjectId(id);
  if (!oid) notFound();

  const conn = await getMongoConnection('live');
  const { Invoice, Restaurant } = getModels(conn);

  const invoice = await Invoice.findById(oid).lean().exec();
  if (!invoice) notFound();

  const restaurant = await Restaurant.findById(invoice.restaurantId, { name: 1, slug: 1 })
    .lean()
    .exec();

  const statusColors: Record<string, string> = {
    draft: 'bg-neutral-100 text-neutral-600',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
    void: 'bg-neutral-100 text-neutral-500',
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/invoices"
        className="text-muted-foreground mb-4 inline-block text-sm hover:underline"
      >
        &larr; Back to invoices
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{invoice.number}</h1>
          <p className="text-muted-foreground text-sm">
            {restaurant?.name ?? 'Unknown Restaurant'} ({restaurant?.slug ?? ''})
          </p>
        </div>
        <span
          className={cn(
            'inline-block rounded-full px-3 py-1 text-sm font-medium',
            statusColors[invoice.status] ?? '',
          )}
        >
          {invoice.status}
        </span>
      </div>

      {/* Details */}
      <section className="border-border mb-6 rounded-lg border p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Period</p>
            <p>
              {new Date(invoice.periodStart).toLocaleDateString()} –{' '}
              {new Date(invoice.periodEnd).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Due Date</p>
            <p>{new Date(invoice.dueAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Total</p>
            <p className="text-lg font-bold tabular-nums">
              {(invoice.totalMinor / 100).toFixed(2)} {invoice.currency}
            </p>
          </div>
          {invoice.paidAt && (
            <div>
              <p className="text-muted-foreground text-xs">Paid At</p>
              <p>{new Date(invoice.paidAt).toLocaleString()}</p>
            </div>
          )}
        </div>
      </section>

      {/* Line items */}
      <section className="border-border mb-6 rounded-lg border">
        <h2 className="border-border border-b px-4 py-3 text-sm font-semibold">Line Items</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border bg-muted/50 border-b text-left">
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 text-right font-medium">Qty</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item, i) => (
              <tr key={i} className="border-border border-b last:border-0">
                <td className="px-4 py-2">{item.description}</td>
                <td className="px-4 py-2 text-right tabular-nums">{item.quantity}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {(item.amountMinor / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Dunning attempts */}
      {invoice.dunningAttempts.length > 0 && (
        <section className="border-border rounded-lg border">
          <h2 className="border-border border-b px-4 py-3 text-sm font-semibold">
            Payment Attempts
          </h2>
          <div className="divide-border divide-y">
            {invoice.dunningAttempts.map((attempt, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-muted-foreground text-xs">
                  {new Date(attempt.attemptedAt).toLocaleString()}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    attempt.succeeded ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
                  )}
                >
                  {attempt.succeeded ? 'Success' : `Failed: ${attempt.failureReason ?? 'Unknown'}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
