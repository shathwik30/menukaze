import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireSuperAdmin } from '@/lib/session';
import { cn } from '@menukaze/ui';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ status?: string; page?: string }>;
}

const PAGE_SIZE = 30;

export default async function InvoicesPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const params = await searchParams;
  const statusFilter = params.status ?? '';
  const page = Math.max(1, Number(params.page) || 1);

  const conn = await getMongoConnection('live');
  const { Invoice, Restaurant } = getModels(conn);

  const filter: Record<string, unknown> = {};
  if (statusFilter) filter.status = statusFilter;

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean()
      .exec(),
    Invoice.countDocuments(filter).exec(),
  ]);

  const restIds = [...new Set(invoices.map((inv) => inv.restaurantId))];
  const restaurants = restIds.length
    ? await Restaurant.find({ _id: { $in: restIds } }, { name: 1 })
        .lean()
        .exec()
    : [];
  const restMap = new Map(restaurants.map((r) => [String(r._id), r.name]));

  const statusColors: Record<string, string> = {
    draft: 'bg-neutral-100 text-neutral-600',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
    void: 'bg-neutral-100 text-neutral-500',
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold">Invoices</h1>

      {invoices.length === 0 ? (
        <p className="text-muted-foreground">
          No invoices yet. Invoices will appear here after the first billing cycle.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="border-border overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border bg-muted/50 border-b text-left">
                  <th className="px-4 py-3 font-medium">Invoice #</th>
                  <th className="px-4 py-3 font-medium">Restaurant</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={String(inv._id)}
                    className="border-border hover:bg-muted/30 border-b last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/invoices/${String(inv._id)}`}
                        className="font-mono text-xs font-medium hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {restMap.get(String(inv.restaurantId)) ?? 'Unknown'}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {new Date(inv.periodStart).toLocaleDateString()} –{' '}
                      {new Date(inv.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(inv.totalMinor / 100).toFixed(2)} {inv.currency}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                          statusColors[inv.status] ?? '',
                        )}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {new Date(inv.dueAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Link
                  href={`/invoices?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ''}`}
                  className={cn(
                    'border-input rounded-md border px-3 py-1.5 text-sm',
                    page <= 1 && 'pointer-events-none opacity-50',
                  )}
                >
                  Previous
                </Link>
                <Link
                  href={`/invoices?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ''}`}
                  className={cn(
                    'border-input rounded-md border px-3 py-1.5 text-sm',
                    page >= totalPages && 'pointer-events-none opacity-50',
                  )}
                >
                  Next
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
