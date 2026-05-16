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
    if (!sessionByTableId.has(key)) {
      sessionByTableId.set(key, tableSession);
    }
  }
  const activeOrderTableIds = new Set(
    activeOrders
      .map((order) => (order.tableId ? String(order.tableId) : null))
      .filter((tableId): tableId is string => Boolean(tableId)),
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
      <div
        style={{
          padding: '28px 40px 24px',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
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
            Floor plan
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
            Tables &amp; QR
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)' }}>
            Dine-in tables and QR codes for {restaurant?.name}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {rows.length > 0 && canPrintQr ? (
            <>
              <Link
                href="/admin/tables/print"
                target="_blank"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--mk-ink-600)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                Print all QRs
              </Link>
              <Link
                href="/admin/tables/print/download"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--mk-ink-600)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                Download PDF
              </Link>
            </>
          ) : null}
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
      </div>
      <div style={{ padding: '24px 40px 48px' }}>
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
