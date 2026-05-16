'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import {
  channels,
  isOrderCreatedEvent,
  isOrderStatusChangedEvent,
  type OrderStatus,
} from '@menukaze/realtime';
import { formatPickupNumber } from '@menukaze/shared';

export interface OrderLineDetail {
  qty: number;
  name: string;
  lineTotalLabel: string;
  modifiers: string[];
  notes?: string;
}

export interface OrderRow {
  id: string;
  publicOrderId: string;
  pickupNumber?: number;
  channel: string;
  type: string;
  status: OrderStatus;
  paymentStatus: string;
  customerName: string;
  totalLabel: string;
  subtotalLabel: string;
  taxLabel: string;
  createdAt: string;
  itemCount: number;
  items: OrderLineDetail[];
  statusHistory: { status: string; at: string }[];
  cancelReason?: string;
}

interface Props {
  restaurantId: string;
  initialRows: OrderRow[];
}

const ACTIVE_STATUSES: OrderStatus[] = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
];

const STATUS_STYLE: Record<string, { bg: string; fg: string; dot: string }> = {
  received: { bg: 'var(--mk-canvas-200)', fg: 'var(--mk-ink-700)', dot: 'var(--mk-ink-400)' },
  confirmed: { bg: 'var(--mk-lapis-50)', fg: 'var(--mk-lapis-700)', dot: 'var(--mk-lapis-500)' },
  preparing: {
    bg: 'var(--mk-saffron-50)',
    fg: 'var(--mk-saffron-800)',
    dot: 'var(--mk-saffron-500)',
  },
  ready: { bg: 'var(--mk-jade-50)', fg: 'var(--mk-jade-700)', dot: 'var(--mk-jade-500)' },
  served: { bg: 'var(--mk-jade-50)', fg: 'var(--mk-jade-700)', dot: 'var(--mk-jade-500)' },
  out_for_delivery: {
    bg: 'var(--mk-lapis-50)',
    fg: 'var(--mk-lapis-700)',
    dot: 'var(--mk-lapis-500)',
  },
  delivered: { bg: 'var(--mk-jade-50)', fg: 'var(--mk-jade-700)', dot: 'var(--mk-jade-500)' },
  completed: { bg: 'var(--mk-canvas-200)', fg: 'var(--mk-ink-500)', dot: 'var(--mk-ink-300)' },
  cancelled: { bg: 'var(--mk-rose-50)', fg: 'var(--mk-rose-700)', dot: 'var(--mk-rose-400)' },
};
const DEFAULT_STATUS_STYLE = STATUS_STYLE.received!;

const CHANNEL_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  online: { bg: 'var(--mk-lapis-50)', fg: 'var(--mk-lapis-700)', label: 'Storefront' },
  storefront: { bg: 'var(--mk-lapis-50)', fg: 'var(--mk-lapis-700)', label: 'Storefront' },
  qr: { bg: 'var(--mk-jade-50)', fg: 'var(--mk-jade-700)', label: 'QR dine-in' },
  qr_dinein: { bg: 'var(--mk-jade-50)', fg: 'var(--mk-jade-700)', label: 'QR dine-in' },
  kiosk: { bg: 'var(--mk-saffron-50)', fg: 'var(--mk-saffron-800)', label: 'Kiosk' },
  walkin: { bg: 'var(--mk-canvas-200)', fg: 'var(--mk-ink-700)', label: 'Walk-in' },
  walk_in: { bg: 'var(--mk-canvas-200)', fg: 'var(--mk-ink-700)', label: 'Walk-in' },
  api: { bg: 'var(--mk-rose-50)', fg: 'var(--mk-rose-700)', label: 'API' },
};

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export function OrdersLive({ restaurantId, initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<OrderRow[]>(initialRows);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<TabValue>('all');
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(initialRows[0]?.id ?? null);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);
  useEffect(() => {
    if (initialRows[0]) setSelectedId(initialRows[0].id);
  }, [initialRows]);

  useEffect(() => {
    const client = new Ably.Realtime({ authUrl: '/api/ably/token' });
    client.connection.on('connected', () => setConnected(true));
    client.connection.on('failed', () => setConnected(false));
    const ch = client.channels.get(channels.orders(restaurantId));

    const handler = (msg: Ably.Message) => {
      if (msg.name === 'order.status_changed' && isOrderStatusChangedEvent(msg.data)) {
        const payload = msg.data;
        const status = payload.status;
        setRows((prev) => prev.map((r) => (r.id === payload.orderId ? { ...r, status } : r)));
      }
      if (msg.name === 'order.created' && isOrderCreatedEvent(msg.data)) {
        router.refresh();
      }
    };
    void ch.subscribe(handler);
    return () => {
      ch.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId, router]);

  const filtered = useMemo(() => {
    let out = rows;
    if (tab === 'active') out = out.filter((r) => ACTIVE_STATUSES.includes(r.status));
    if (tab === 'completed') out = out.filter((r) => r.status === 'completed');
    if (tab === 'cancelled') out = out.filter((r) => r.status === 'cancelled');
    if (channelFilter !== 'all') out = out.filter((r) => r.channel === channelFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      out = out.filter(
        (r) =>
          r.customerName.toLowerCase().includes(q) ||
          r.publicOrderId.toLowerCase().includes(q) ||
          String(r.pickupNumber ?? '').includes(q),
      );
    }
    return out;
  }, [rows, tab, channelFilter, search]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
      completed: rows.filter((r) => r.status === 'completed').length,
      cancelled: rows.filter((r) => r.status === 'cancelled').length,
    }),
    [rows],
  );

  const selected = rows.find((r) => r.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            background: 'var(--mk-canvas-100)',
            borderRadius: 10,
            padding: 3,
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 30,
                padding: '0 12px',
                fontSize: 12.5,
                fontWeight: 500,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: tab === t.value ? 'white' : 'transparent',
                color: tab === t.value ? 'var(--mk-ink-950)' : 'var(--mk-ink-500)',
                boxShadow: tab === t.value ? 'var(--shadow-xs)' : 'none',
                transition: 'all 100ms',
              }}
            >
              {t.label}
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  background: tab === t.value ? 'var(--mk-canvas-100)' : 'transparent',
                  color: 'var(--mk-ink-500)',
                  padding: '1px 6px',
                  borderRadius: 99,
                  minWidth: 20,
                  textAlign: 'center',
                }}
              >
                {counts[t.value]}
              </span>
            </button>
          ))}
        </div>

        {/* Search + filters */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Live dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
            <span style={{ position: 'relative', display: 'inline-flex', width: 7, height: 7 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: connected ? 'var(--mk-jade-500)' : 'var(--mk-ink-300)',
                  display: 'block',
                }}
              />
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--mk-ink-500)' }}>
              {connected ? 'Live' : 'Connecting…'}
            </span>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              style={{
                width: 13,
                height: 13,
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--mk-ink-400)',
                pointerEvents: 'none',
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pickup #, customer, order ID…"
              style={{
                height: 34,
                width: 240,
                paddingLeft: 30,
                paddingRight: 12,
                fontSize: 12.5,
                border: '1px solid var(--mk-ink-200)',
                borderRadius: 9,
                background: 'white',
                color: 'var(--mk-ink-950)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Channel select */}
          <div style={{ position: 'relative' }}>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                height: 34,
                padding: '0 30px 0 11px',
                fontSize: 12.5,
                fontWeight: 500,
                border: '1px solid var(--mk-ink-200)',
                borderRadius: 9,
                background: 'white',
                color: 'var(--mk-ink-950)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <option value="all">All channels</option>
              <option value="qr_dinein">QR dine-in</option>
              <option value="qr">QR dine-in</option>
              <option value="storefront">Storefront</option>
              <option value="online">Storefront</option>
              <option value="kiosk">Kiosk</option>
              <option value="walk_in">Walk-in</option>
              <option value="walkin">Walk-in</option>
              <option value="api">Public API</option>
            </select>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              style={{
                width: 12,
                height: 12,
                position: 'absolute',
                right: 9,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--mk-ink-500)',
                pointerEvents: 'none',
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      {/* Split panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selected ? 'minmax(0, 1fr) 380px' : '1fr',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        {/* Orders table */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--mk-ink-100)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
              <colgroup>
                <col style={{ width: 160 }} />
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 88 }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'var(--mk-canvas-50)' }}>
                  {[
                    { label: 'Pickup', right: false },
                    { label: 'Customer', right: false },
                    { label: 'Channel', right: false },
                    { label: 'Items', right: true },
                    { label: 'Age', right: false },
                    { label: 'Status', right: false },
                    { label: 'Total', right: true },
                  ].map((h) => (
                    <th
                      key={h.label}
                      style={{
                        textAlign: h.right ? 'right' : 'left',
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'var(--mk-ink-500)',
                        padding: '11px 14px',
                        borderBottom: '1px solid var(--mk-ink-100)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: '40px 24px',
                        textAlign: 'center',
                        color: 'var(--mk-ink-400)',
                        fontSize: 13,
                      }}
                    >
                      No orders match your filters
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const isActive = row.id === selectedId;
                    const pickup = formatPickupNumber(row);
                    const chan = CHANNEL_CHIP[row.channel] ?? {
                      bg: 'var(--mk-canvas-200)',
                      fg: 'var(--mk-ink-700)',
                      label: row.channel,
                    };
                    const st = STATUS_STYLE[row.status] ?? DEFAULT_STATUS_STYLE;
                    const ageMin = Math.floor(
                      (Date.now() - new Date(row.createdAt).getTime()) / 60000,
                    );
                    const agePct = Math.min(1, ageMin / 20);
                    const ageColor =
                      ageMin >= 10
                        ? 'var(--mk-rose-500)'
                        : ageMin >= 5
                          ? 'var(--mk-saffron-500)'
                          : 'var(--mk-jade-500)';

                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        style={{
                          cursor: 'pointer',
                          background: isActive ? 'var(--mk-canvas-100)' : 'white',
                          transition: 'background 80ms',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive)
                            (e.currentTarget as HTMLElement).style.background =
                              'var(--mk-canvas-50)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive)
                            (e.currentTarget as HTMLElement).style.background = 'white';
                        }}
                      >
                        {/* Pickup */}
                        <td style={cell()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 40,
                                height: 24,
                                padding: '0 7px',
                                background: 'var(--mk-ink-950)',
                                color: 'var(--mk-canvas-50)',
                                borderRadius: 6,
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11.5,
                                fontWeight: 700,
                              }}
                            >
                              #{pickup}
                            </span>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
                                color: 'var(--mk-ink-400)',
                              }}
                            >
                              {row.publicOrderId}
                            </span>
                          </div>
                        </td>

                        {/* Customer */}
                        <td style={cell()}>
                          <div
                            style={{ fontSize: 13, fontWeight: 500, color: 'var(--mk-ink-950)' }}
                          >
                            {row.customerName}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--mk-ink-400)',
                              marginTop: 1,
                              textTransform: 'capitalize',
                            }}
                          >
                            {row.type.replace(/_/g, ' ')}
                          </div>
                        </td>

                        {/* Channel */}
                        <td style={cell()}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              fontSize: 11,
                              fontWeight: 500,
                              background: chan.bg,
                              color: chan.fg,
                              borderRadius: 5,
                            }}
                          >
                            {chan.label}
                          </span>
                        </td>

                        {/* Items count */}
                        <td style={{ ...cell(), textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                            {row.itemCount}
                          </span>
                        </td>

                        {/* Age */}
                        <td style={cell()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div
                              style={{
                                width: 28,
                                height: 3,
                                borderRadius: 99,
                                background: 'var(--mk-canvas-200)',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${agePct * 100}%`,
                                  height: '100%',
                                  background: ageColor,
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11.5,
                                color: 'var(--mk-ink-600)',
                              }}
                            >
                              {ageMin}m
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td style={cell()}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 500,
                              background: st.bg,
                              color: st.fg,
                            }}
                          >
                            <span
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 99,
                                background: st.dot,
                                flexShrink: 0,
                              }}
                            />
                            {row.status.replace(/_/g, ' ')}
                          </span>
                        </td>

                        {/* Total */}
                        <td style={{ ...cell(), textAlign: 'right' }}>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'var(--mk-ink-950)',
                            }}
                          >
                            {row.totalLabel}
                          </div>
                          {row.paymentStatus !== 'paid' && row.paymentStatus !== 'captured' && (
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: 'var(--mk-rose-700)',
                                marginTop: 1,
                              }}
                            >
                              UNPAID
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderTop: '1px solid var(--mk-ink-100)',
              background: 'var(--mk-canvas-50)',
              fontSize: 11.5,
              color: 'var(--mk-ink-500)',
            }}
          >
            <span>
              Showing {filtered.length} of {rows.length} orders
            </span>
            <Link
              href={`/admin/orders/${selectedId ?? ''}`}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--mk-ink-700)',
                textDecoration: 'none',
                display: selectedId ? 'inline' : 'none',
              }}
            >
              View full detail →
            </Link>
          </div>
        </div>

        {/* Detail panel */}
        {selected && <OrderDetail order={selected} />}
      </div>
    </div>
  );
}

function cell(): React.CSSProperties {
  return {
    padding: '11px 14px',
    fontSize: 13,
    color: 'var(--mk-ink-900)',
    borderBottom: '1px solid var(--mk-ink-100)',
    verticalAlign: 'middle',
  };
}

function OrderDetail({ order }: { order: OrderRow }) {
  const st = STATUS_STYLE[order.status] ?? DEFAULT_STATUS_STYLE;
  const chan = CHANNEL_CHIP[order.channel] ?? { label: order.channel, bg: '', fg: '' };
  const pickup = formatPickupNumber(order);

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--mk-ink-100)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-xs)',
        overflow: 'hidden',
        position: 'sticky',
        top: 76,
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--mk-ink-100)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--mk-saffron-700)',
            }}
          >
            Pickup #{pickup} ·{' '}
            <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: 0 }}>
              {order.publicOrderId}
            </span>
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 500,
              background: st.bg,
              color: st.fg,
            }}
          >
            <span
              style={{ width: 5, height: 5, borderRadius: 99, background: st.dot, flexShrink: 0 }}
            />
            {order.status.replace(/_/g, ' ')}
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: 'var(--mk-ink-950)',
            marginBottom: 3,
          }}
        >
          {order.customerName}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--mk-ink-500)' }}>
          {chan.label} · placed{' '}
          {new Date(order.createdAt).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--mk-ink-100)',
          display: 'flex',
          gap: 8,
        }}
      >
        <Link
          href={`/admin/orders/${order.id}`}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 32,
            fontSize: 12.5,
            fontWeight: 500,
            background: 'var(--mk-ink-950)',
            color: 'white',
            borderRadius: 8,
            textDecoration: 'none',
            border: 'none',
          }}
        >
          Manage order →
        </Link>
        <Link
          href={`/admin/orders/${order.id}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid var(--mk-ink-200)',
            background: 'white',
            textDecoration: 'none',
            color: 'var(--mk-ink-700)',
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ⋯
        </Link>
      </div>

      {/* Line items */}
      <div
        style={{
          padding: '8px 20px 12px',
          borderBottom: '1px solid var(--mk-ink-100)',
          maxHeight: 260,
          overflowY: 'auto',
        }}
      >
        {order.items.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--mk-ink-400)', padding: '8px 0' }}>
            No items
          </div>
        ) : (
          order.items.map((line, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '9px 0',
                borderBottom: i < order.items.length - 1 ? '1px solid var(--mk-ink-100)' : 'none',
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 5,
                  background: 'var(--mk-canvas-200)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                ×{line.qty}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mk-ink-950)' }}>
                    {line.name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {line.lineTotalLabel}
                  </span>
                </div>
                {line.modifiers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                    {line.modifiers.map((m, j) => (
                      <span
                        key={j}
                        style={{
                          fontSize: 10,
                          padding: '2px 5px',
                          background: 'var(--mk-saffron-50)',
                          color: 'var(--mk-saffron-800)',
                          borderRadius: 4,
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
                {line.notes && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--mk-ink-500)',
                      marginTop: 3,
                      fontStyle: 'italic',
                    }}
                  >
                    &ldquo;{line.notes}&rdquo;
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--mk-ink-100)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12.5,
            color: 'var(--mk-ink-600)',
            padding: '3px 0',
          }}
        >
          <span>Subtotal</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{order.subtotalLabel}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12.5,
            color: 'var(--mk-ink-600)',
            padding: '3px 0',
          }}
        >
          <span>Tax</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{order.taxLabel}</span>
        </div>
        <div style={{ height: 1, background: 'var(--mk-ink-100)', margin: '7px 0' }} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--mk-ink-950)',
          }}
        >
          <span>Total</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{order.totalLabel}</span>
        </div>
      </div>

      {/* Timeline */}
      {order.statusHistory.length > 0 && (
        <div style={{ padding: '12px 20px 16px' }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--mk-ink-500)',
              marginBottom: 10,
            }}
          >
            Activity
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {order.statusHistory
              .slice()
              .reverse()
              .map((ev, i, arr) => (
                <li
                  key={i}
                  style={{ display: 'flex', gap: 10, paddingBottom: 10, position: 'relative' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        flexShrink: 0,
                        background: i === 0 ? 'var(--mk-saffron-500)' : 'var(--mk-ink-300)',
                      }}
                    />
                    {i < arr.length - 1 && (
                      <span
                        style={{ width: 1, flex: 1, background: 'var(--mk-ink-200)', marginTop: 3 }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, paddingTop: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: 'var(--mk-ink-900)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {ev.status.replace(/_/g, ' ')}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--mk-ink-500)',
                      }}
                    >
                      {new Date(ev.at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </li>
              ))}
          </ul>
          {order.cancelReason && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                background: 'var(--mk-rose-50)',
                borderRadius: 8,
                border: '1px solid var(--mk-rose-100)',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mk-rose-700)' }}>
                Cancellation reason
              </div>
              <div style={{ fontSize: 12, color: 'var(--mk-rose-800)', marginTop: 2 }}>
                {order.cancelReason}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
