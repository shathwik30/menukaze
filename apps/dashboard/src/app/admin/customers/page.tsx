import { Button, Input, Select } from '@menukaze/ui';
import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import { requirePageFlag } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string; sort?: string }>;
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const { restaurantId } = await requirePageFlag(['customers.view']);
  const params = await searchParams;
  const query = params.q?.trim() ?? '';
  const sort = params.sort === 'recent' ? 'recent' : 'top';

  const conn = await getMongoConnection('live');
  const { Customer, Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId, { locale: 1, currency: 1 })
    .lean()
    .exec();
  const locale = restaurant?.locale ?? 'en-US';
  const restaurantCurrency = currencyCodeOrDefault(restaurant?.currency);

  const filter: Record<string, unknown> = { restaurantId };
  if (query) {
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { phone: { $regex: safe } },
      { email: { $regex: safe, $options: 'i' } },
      { name: { $regex: safe, $options: 'i' } },
    ];
  }
  const sortKey: Record<string, -1> =
    sort === 'recent' ? { lastOrderAt: -1 } : { lifetimeOrders: -1 };
  const customers = await Customer.find(filter).sort(sortKey).limit(100).lean().exec();
  const selectedCustomer = customers[0] ?? null;
  const totalOrders = customers.reduce((sum, customer) => sum + customer.lifetimeOrders, 0);
  const totalRevenueMinor = customers.reduce(
    (sum, customer) => sum + customer.lifetimeRevenueMinor,
    0,
  );
  const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentCustomers = customers.filter(
    (customer) => new Date(customer.lastOrderAt).getTime() >= recentCutoff,
  ).length;

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
            Guests
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
            Customers
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)' }}>
            {customers.length} record{customers.length === 1 ? '' : 's'}, deduped by phone.
          </p>
        </div>
      </div>

      <div style={{ padding: '24px 40px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <SummaryCard label="Customers" value={String(customers.length)} />
          <SummaryCard label="Orders" value={String(totalOrders)} />
          <SummaryCard
            label="Lifetime"
            value={formatMoney(totalRevenueMinor, restaurantCurrency, locale)}
          />
        </div>

        <form
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
          }}
          method="get"
        >
          <Input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search email, name, phone"
            className="border-border h-9 rounded-md border px-3 text-sm"
            style={{ flex: 1, minWidth: 200 }}
          />
          <Select
            name="sort"
            defaultValue={sort}
            className="border-border h-9 rounded-md border px-2 text-sm"
          >
            <option value="top">Top spenders</option>
            <option value="recent">Recently active</option>
          </Select>
          <Button
            variant="plain"
            size="none"
            type="submit"
            className="border-border hover:bg-muted inline-flex h-9 items-center rounded-md border px-3 text-sm"
          >
            Search
          </Button>
        </form>

        {customers.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--mk-ink-500)' }}>
            No customers yet. They appear here as soon as someone places an order.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: selectedCustomer ? '1fr 340px' : '1fr',
              gap: 16,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                background: 'white',
                border: '1px solid var(--mk-ink-100)',
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <div
                style={{
                  padding: '16px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--mk-ink-100)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mk-ink-950)' }}>
                  Customer list{' '}
                  <span style={{ color: 'var(--mk-ink-400)', fontWeight: 500, marginLeft: 6 }}>
                    {customers.length}
                  </span>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--mk-ink-500)' }}>
                  {recentCustomers} active in 30 days
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr
                    style={{
                      background: 'var(--mk-canvas-50)',
                      borderBottom: '1px solid var(--mk-ink-100)',
                    }}
                  >
                    {['Name / Email', 'First channel', 'Orders', 'Lifetime', 'Last order'].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: '10px 16px',
                            textAlign: 'left',
                            fontSize: 10.5,
                            fontWeight: 600,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--mk-ink-500)',
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const currency = currencyCodeOrDefault(c.currency);
                    return (
                      <tr
                        key={String(c._id)}
                        style={{ borderBottom: '1px solid var(--mk-ink-100)' }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <Link
                            href={`/admin/customers/${String(c._id)}`}
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              color: 'var(--mk-ink-950)',
                              textDecoration: 'none',
                            }}
                          >
                            {c.name ?? c.phone}
                          </Link>
                          <p
                            style={{
                              margin: '2px 0 0',
                              fontSize: 11.5,
                              color: 'var(--mk-ink-400)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {c.phone}
                          </p>
                          <p
                            style={{
                              margin: '1px 0 0',
                              fontSize: 11.5,
                              color: 'var(--mk-ink-400)',
                            }}
                          >
                            {c.email}
                          </p>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <ChannelBadge channel={c.firstChannel} />
                        </td>
                        <td
                          style={{ padding: '12px 16px', fontSize: 13, color: 'var(--mk-ink-700)' }}
                        >
                          {c.lifetimeOrders}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--mk-ink-900)',
                          }}
                        >
                          {formatMoney(c.lifetimeRevenueMinor, currency, locale)}
                        </td>
                        <td
                          style={{ padding: '12px 16px', fontSize: 12, color: 'var(--mk-ink-400)' }}
                        >
                          {new Date(c.lastOrderAt).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedCustomer ? (
              <aside
                style={{
                  position: 'sticky',
                  top: 80,
                  background: 'white',
                  border: '1px solid var(--mk-ink-100)',
                  borderRadius: 14,
                  boxShadow: 'var(--shadow-xs)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: 22, borderBottom: '1px solid var(--mk-ink-100)' }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--mk-ink-400)',
                    }}
                  >
                    Customer detail
                  </div>
                  <h2
                    style={{
                      margin: '8px 0 0',
                      fontFamily: 'var(--font-serif)',
                      fontSize: 28,
                      fontWeight: 500,
                      letterSpacing: '-0.02em',
                      color: 'var(--mk-ink-950)',
                    }}
                  >
                    {selectedCustomer.name ?? selectedCustomer.phone}
                  </h2>
                  <p
                    style={{
                      margin: '5px 0 0',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--mk-ink-500)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {selectedCustomer.email}
                  </p>
                </div>
                <div style={{ padding: 22, display: 'grid', gap: 14 }}>
                  <DetailRow label="Phone" value={selectedCustomer.phone} mono />
                  <DetailRow
                    label="First channel"
                    value={<ChannelBadge channel={selectedCustomer.firstChannel} />}
                  />
                  <DetailRow
                    label="Lifetime orders"
                    value={String(selectedCustomer.lifetimeOrders)}
                    mono
                  />
                  <DetailRow
                    label="Lifetime revenue"
                    value={formatMoney(
                      selectedCustomer.lifetimeRevenueMinor,
                      currencyCodeOrDefault(selectedCustomer.currency),
                      locale,
                    )}
                    mono
                  />
                  <DetailRow
                    label="First order"
                    value={new Date(selectedCustomer.firstOrderAt).toLocaleString()}
                  />
                  <DetailRow
                    label="Last order"
                    value={new Date(selectedCustomer.lastOrderAt).toLocaleString()}
                  />
                  <Link
                    href={`/admin/customers/${String(selectedCustomer._id)}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 34,
                      borderRadius: 8,
                      background: 'var(--mk-ink-950)',
                      color: 'var(--mk-canvas-50)',
                      textDecoration: 'none',
                      fontSize: 12.5,
                      fontWeight: 700,
                    }}
                  >
                    Open profile
                  </Link>
                </div>
              </aside>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        border: '1px solid var(--mk-ink-100)',
        background: 'var(--mk-canvas-50)',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--mk-ink-400)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: 'var(--font-serif)',
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: 'var(--mk-ink-950)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const label = channel === 'qr_dinein' ? 'QR dine-in' : channel.replace('_', ' ');
  const tone =
    channel === 'qr_dinein'
      ? { bg: 'var(--mk-jade-50)', fg: 'var(--mk-jade-700)' }
      : channel === 'api'
        ? { bg: 'var(--mk-lapis-50)', fg: 'var(--mk-lapis-700)' }
        : channel === 'walk_in'
          ? { bg: 'var(--mk-saffron-50)', fg: 'var(--mk-saffron-800)' }
          : { bg: 'var(--mk-canvas-100)', fg: 'var(--mk-ink-700)' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
        fontSize: 11.5,
        fontWeight: 700,
        textTransform: 'capitalize',
      }}
    >
      {label}
    </span>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--mk-ink-400)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--mk-ink-900)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
