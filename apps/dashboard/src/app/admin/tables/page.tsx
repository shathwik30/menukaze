import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { TablesManager, type ManagerTable } from './tables-manager';

export const dynamic = 'force-dynamic';

export default async function TablesPage() {
  const { session, restaurantId, permissions } = await requirePageFlag(['tables.view']);
  const canEditTables = permissions.includes('tables.edit');
  const canPrintQr = permissions.includes('tables.qr_print');
  const canProcessPayments = permissions.includes('payments.process');

  const conn = await getMongoConnection('live');
  const { Restaurant, Table, TableSession } = getModels(conn);
  const [restaurant, tables, tableSessions] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Table.find({ restaurantId }).sort({ number: 1 }).lean().exec(),
    TableSession.find({
      restaurantId,
      status: { $in: ['active', 'bill_requested', 'needs_review'] },
    })
      .sort({ startedAt: -1 })
      .lean()
      .exec(),
  ]);

  const slug = restaurant?.slug ?? 'demo';
  const sessionByTableId = new Map<string, (typeof tableSessions)[number]>();
  for (const tableSession of tableSessions) {
    const key = String(tableSession.tableId);
    if (!sessionByTableId.has(key)) {
      sessionByTableId.set(key, tableSession);
    }
  }
  const rows: ManagerTable[] = tables.map((t) => ({
    ...(sessionByTableId.get(String(t._id))
      ? {
          activeSessionId: String(sessionByTableId.get(String(t._id))?._id),
          activeSessionCustomer: sessionByTableId.get(String(t._id))?.customer.name ?? undefined,
        }
      : {}),
    id: String(t._id),
    number: t.number,
    name: t.name,
    capacity: t.capacity,
    zone: t.zone,
    qrToken: canPrintQr ? t.qrToken : '',
    status: t.status,
    qrUrl: canPrintQr ? `https://${slug}.menukaze.com/t/${t.qrToken}` : '',
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
        <div className="flex items-center gap-4">
          {rows.length > 0 && canPrintQr ? (
            <>
              <Link
                href="/admin/tables/print"
                target="_blank"
                className="text-foreground text-sm underline underline-offset-4"
              >
                Print all QRs
              </Link>
              <Link
                href="/admin/tables/print/download"
                className="text-foreground text-sm underline underline-offset-4"
              >
                Download PDF
              </Link>
            </>
          ) : null}
          <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
            ← Back
          </Link>
        </div>
      </header>

      <TablesManager
        restaurantId={session.restaurantId}
        tables={rows}
        canEdit={canEditTables}
        canPrintQr={canPrintQr}
        canProcessPayments={canProcessPayments}
      />
    </main>
  );
}
