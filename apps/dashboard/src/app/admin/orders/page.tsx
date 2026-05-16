import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import { requirePageFlag } from '@/lib/session';
import { OrdersLive } from './orders-live';

export const dynamic = 'force-dynamic';

export default async function DashboardOrdersPage() {
  const { session, restaurantId, permissions } = await requirePageFlag(['orders.view_all']);
  const canCreateWalkIn = permissions.includes('orders.create_walkin');

  const conn = await getMongoConnection('live');
  const { Restaurant, Order } = getModels(conn);

  const [restaurant, orders] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Order.find({ restaurantId }).sort({ createdAt: -1 }).limit(50).lean().exec(),
  ]);

  const currency = currencyCodeOrDefault(restaurant?.currency);
  const locale = restaurant?.locale ?? 'en-US';

  const rows = orders.map((o) => ({
    id: String(o._id),
    publicOrderId: o.publicOrderId,
    ...(typeof o.pickupNumber === 'number' ? { pickupNumber: o.pickupNumber } : {}),
    channel: o.channel,
    type: o.type,
    status: o.status,
    paymentStatus: o.payment.status,
    customerName: o.customer.name,
    subtotalLabel: formatMoney(o.subtotalMinor, currency, locale),
    taxLabel: formatMoney(o.taxMinor, currency, locale),
    totalLabel: formatMoney(o.totalMinor, currency, locale),
    itemCount: o.items.reduce((sum, item) => sum + item.quantity, 0),
    items: o.items.map((item) => ({
      qty: item.quantity,
      name: item.name,
      lineTotalLabel: formatMoney(item.lineTotalMinor, currency, locale),
      modifiers: item.modifiers.map((modifier) => modifier.optionName),
      ...(item.notes ? { notes: item.notes } : {}),
    })),
    statusHistory: o.statusHistory.map((event) => ({
      status: event.status,
      at: event.at instanceof Date ? event.at.toISOString() : String(event.at),
    })),
    ...(o.cancelReason ? { cancelReason: o.cancelReason } : {}),
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
  }));

  return (
    <div>
      {/* Page header */}
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
            Operations · Live
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              lineHeight: 1.05,
              color: 'var(--mk-ink-950)',
            }}
          >
            Orders
          </h1>
          <p
            style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)', maxWidth: 560 }}
          >
            Every order across QR dine-in, storefront, kiosk and walk-ins — real time.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canCreateWalkIn ? (
            <Link href="/admin/orders/new" style={{ textDecoration: 'none' }}>
              <button
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 38,
                  padding: '0 16px',
                  fontSize: 13.5,
                  fontWeight: 500,
                  letterSpacing: '-0.005em',
                  borderRadius: 10,
                  background: 'var(--mk-ink-950)',
                  color: 'var(--mk-canvas-50)',
                  border: '1px solid var(--mk-ink-950)',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: 'pointer',
                }}
              >
                <PlusIcon /> New walk-in
              </button>
            </Link>
          ) : null}
        </div>
      </div>

      <div style={{ padding: '20px 40px 48px' }}>
        <OrdersLive restaurantId={session.restaurantId} initialRows={rows} />
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-4"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
