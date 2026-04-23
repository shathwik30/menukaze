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
import { Badge, Card, EmptyState, cn, type BadgeProps } from '@menukaze/ui';

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
  createdAt: string;
}

interface Props {
  restaurantId: string;
  initialRows: OrderRow[];
}

const STATUS_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  received: 'subtle',
  confirmed: 'info',
  preparing: 'warning',
  ready: 'success',
  served: 'accent',
  out_for_delivery: 'info',
  delivered: 'success',
  completed: 'subtle',
  cancelled: 'danger',
};

const CHANNEL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  online: {
    label: 'Online',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M8 20h8" />
      </svg>
    ),
  },
  qr: {
    label: 'QR',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden
      >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 17v3h-3" />
      </svg>
    ),
  },
  kiosk: {
    label: 'Kiosk',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden
      >
        <rect x="3" y="2" width="18" height="16" rx="2" />
        <path d="M12 18v4M8 22h8" />
      </svg>
    ),
  },
  walkin: {
    label: 'Walk-in',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </svg>
    ),
  },
  api: {
    label: 'API',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
};

export function OrdersLive({ restaurantId, initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<OrderRow[]>(initialRows);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    const client = new Ably.Realtime({ authUrl: '/api/ably/token' });
    client.connection.on('connected', () => setConnected(true));
    client.connection.on('failed', () => setConnected(false));
    const channel = client.channels.get(channels.orders(restaurantId));

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
    void channel.subscribe(handler);
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId, router]);

  const active = useMemo(
    () => rows.filter((r) => r.status !== 'completed' && r.status !== 'cancelled'),
    [rows],
  );
  const archived = useMemo(
    () => rows.filter((r) => r.status === 'completed' || r.status === 'cancelled'),
    [rows],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            connected ? 'bg-jade-500' : 'bg-ink-400 dark:bg-ink-600',
          )}
        >
          {connected ? (
            <span className="bg-jade-500 absolute inset-0 animate-ping rounded-full opacity-50" />
          ) : null}
        </span>
        <span className="text-ink-700 dark:text-ink-300 font-medium">
          {connected ? 'Live · receiving real-time updates' : 'Connecting to live feed…'}
        </span>
      </div>

      <Section title="Active" count={active.length} rows={active} />
      <Section title="Completed &amp; cancelled" count={archived.length} rows={archived} dimmed />
    </div>
  );
}

function Section({
  title,
  count,
  rows,
  dimmed,
}: {
  title: string;
  count: number;
  rows: OrderRow[];
  dimmed?: boolean;
}) {
  return (
    <Card variant="surface" radius="lg" className="overflow-hidden">
      <div className="border-ink-100 dark:border-ink-800 flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-ink-600 dark:text-ink-400 text-[13px] font-semibold tracking-[0.14em] uppercase">
          <span dangerouslySetInnerHTML={{ __html: title }} />
        </h2>
        <Badge variant="subtle" size="sm" shape="pill">
          {count}
        </Badge>
      </div>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            compact
            title={dimmed ? 'No archived orders' : 'No active orders right now'}
            description={
              dimmed
                ? 'Completed and cancelled orders will appear here.'
                : 'New orders appear instantly as they come in.'
            }
          />
        </div>
      ) : (
        <ul className={cn('divide-ink-100 dark:divide-ink-800 divide-y', dimmed && 'opacity-85')}>
          {rows.map((row) => {
            const pickup = formatPickupNumber(row);
            const channel = CHANNEL_META[row.channel] ?? {
              label: row.channel,
              icon: null,
            };
            return (
              <li key={row.id}>
                <Link
                  href={`/admin/orders/${row.id}`}
                  className="hover:bg-canvas-100/60 dark:hover:bg-ink-900/60 group flex items-center justify-between gap-4 px-6 py-4 transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="bg-canvas-100 ring-ink-200 dark:bg-ink-800 dark:ring-ink-700 flex size-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset">
                      <span className="mk-nums text-foreground font-mono text-[13px] font-semibold tracking-tight tabular-nums">
                        #{pickup}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
                        {row.customerName}
                        <span className="text-ink-400 dark:text-ink-500 font-mono text-[11px] font-normal">
                          {row.publicOrderId}
                        </span>
                      </p>
                      <p className="text-ink-500 dark:text-ink-400 mt-0.5 flex items-center gap-3 text-[12px]">
                        <span className="inline-flex items-center gap-1">
                          {channel.icon} {channel.label}
                        </span>
                        <span className="bg-ink-300 dark:bg-ink-600 size-1 rounded-full" />
                        <span className="capitalize">{row.type.replace('_', ' ')}</span>
                        <span className="bg-ink-300 dark:bg-ink-600 size-1 rounded-full" />
                        <span>
                          {new Date(row.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'subtle'} size="sm" shape="pill">
                      {row.status.replace(/_/g, ' ')}
                    </Badge>
                    <span className="mk-nums text-foreground hidden font-serif text-base font-medium tabular-nums sm:inline">
                      {row.totalLabel}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-ink-400 group-hover:text-ink-700 dark:text-ink-500 dark:group-hover:text-canvas-100 size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
                      aria-hidden
                    >
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
