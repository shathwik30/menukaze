import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { TablesManager, type ManagerTable } from './tables-manager';

export const dynamic = 'force-dynamic';

const ACTIVE_ORDER_STATUSES = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
] as const;
const ACTIVE_TABLE_SESSION_STATUSES = ['active', 'bill_requested', 'needs_review'] as const;

export default async function TablesPage() {
  const { session, restaurantId, permissions } = await requirePageFlag(['tables.view']);
  const canEditTables = permissions.includes('tables.edit');
  const canPrintQr = permissions.includes('tables.qr_print');
  const canProcessPayments = permissions.includes('payments.process');

  const conn = await getMongoConnection('live');
  const { Restaurant, Table, TableSession, Order } = getModels(conn);
  const [restaurant, tables, tableSessions, activeOrders] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Table.find({ restaurantId }).sort({ number: 1 }).lean().exec(),
    TableSession.find({
      restaurantId,
      status: { $in: ACTIVE_TABLE_SESSION_STATUSES },
    })
      .sort({ startedAt: -1 })
      .lean()
      .exec(),
    Order.find(
      {
        restaurantId,
        status: { $in: ACTIVE_ORDER_STATUSES },
        tableId: { $exists: true },
      },
      { tableId: 1 },
    )
      .lean()
      .exec(),
  ]);

  const slug = restaurant?.slug ?? 'demo';
  const sessionByTableId = new Map<string, (typeof tableSessions)[number]>();
  for (const tableSession of tableSessions) {
    const key = String(tableSession.tableId);
    if (!sessionByTableId.has(key)) sessionByTableId.set(key, tableSession);
  }
  const activeOrderTableIds = new Set(
    activeOrders
      .map((o) => (o.tableId ? String(o.tableId) : null))
      .filter((id): id is string => Boolean(id)),
  );
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
    status: effectiveTableStatus(
      sessionByTableId.get(String(t._id))?.status,
      activeOrderTableIds.has(String(t._id)),
    ),
    qrUrl: canPrintQr ? `https://${slug}.menukaze.com/t/${t.qrToken}` : '',
  }));

  return (
    <div>
      <div className="border-ink-100 flex flex-wrap items-end justify-between gap-6 border-b bg-white px-10 pt-7 pb-6">
        <div>
          <p className="text-saffron-700 text-[11px] font-semibold tracking-[0.16em] uppercase">
            Floor plan
          </p>
          <h1 className="text-ink-950 mt-2 font-serif text-3xl font-medium -tracking-tight">
            Tables &amp; QR
          </h1>
          <p className="text-ink-500 mt-2 text-sm">
            Dine-in tables and QR codes for {restaurant?.name}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {rows.length > 0 && canPrintQr ? (
            <>
              <Link
                href="/admin/tables/print"
                target="_blank"
                className="text-ink-600 text-sm font-medium underline underline-offset-[3px]"
              >
                Print all QRs
              </Link>
              <Link
                href="/admin/tables/print/download"
                className="text-ink-600 text-sm font-medium underline underline-offset-[3px]"
              >
                Download PDF
              </Link>
            </>
          ) : null}
          <Link href="/admin" className="text-ink-500 text-sm font-medium">
            ← Back
          </Link>
        </div>
      </div>

      <div className="px-10 py-6 pb-12">
        <TablesManager
          restaurantId={session.restaurantId}
          tables={rows}
          canEdit={canEditTables}
          canPrintQr={canPrintQr}
          canProcessPayments={canProcessPayments}
        />
      </div>
    </div>
  );
}

function effectiveTableStatus(
  sessionStatus: string | undefined,
  hasActiveOrder: boolean,
): ManagerTable['status'] {
  if (sessionStatus === 'bill_requested' || sessionStatus === 'needs_review') return sessionStatus;
  if (sessionStatus === 'active' || hasActiveOrder) return 'occupied';
  return 'available';
}
