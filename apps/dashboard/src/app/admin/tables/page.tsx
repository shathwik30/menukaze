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
  const canToggleHoliday = permissions.includes('settings.toggle_holiday');
  const canPauseQr = permissions.includes('tables.view');

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

  const downloadPdfUrl = rows.length > 0 && canPrintQr ? '/admin/tables/print/download' : undefined;

  return (
    <div className="px-10 py-6 pb-12">
      <TablesManager
        restaurantId={session.restaurantId}
        tables={rows}
        canEdit={canEditTables}
        canPrintQr={canPrintQr}
        canProcessPayments={canProcessPayments}
        canToggleHoliday={canToggleHoliday}
        canPauseQr={canPauseQr}
        holidayModeEnabled={restaurant?.holidayMode?.enabled ?? false}
        holidayModeMessage={restaurant?.holidayMode?.message ?? ''}
        qrOrderingPaused={restaurant?.qrOrderingPaused ?? false}
        downloadPdfUrl={downloadPdfUrl}
      />
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
