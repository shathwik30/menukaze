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

export interface OrderRow {
  id: string;
  publicOrderId: string;
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

const STATUS_CLASSES: Record<string, string> = {
  received: 'bg-slate-100 text-slate-700',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-amber-100 text-amber-800',
  ready: 'bg-emerald-100 text-emerald-800',
  served: 'bg-teal-100 text-teal-800',
  out_for_delivery: 'bg-violet-100 text-violet-800',
  delivered: 'bg-violet-100 text-violet-900',
  completed: 'bg-zinc-100 text-zinc-700',
  cancelled: 'bg-red-100 text-red-800',
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
    <>
      <div className="text-muted-foreground text-xs">
        {connected ? 'Live · updating in real time' : 'Connecting…'}
      </div>

      <Section title={`Active (${active.length})`} rows={active} />
      <Section title={`Archived (${archived.length})`} rows={archived} dimmed />
    </>
  );
}

function Section({ title, rows, dimmed }: { title: string; rows: OrderRow[]; dimmed?: boolean }) {
  return (
    <section className="border-border rounded-lg border p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">No orders in this bucket.</p>
      ) : (
        <ul
          className={
            dimmed ? 'divide-border mt-2 divide-y opacity-70' : 'divide-border mt-2 divide-y'
          }
        >
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-4 py-2 text-sm">
              <div className="min-w-0">
                <p className="text-foreground font-medium">
                  {row.publicOrderId}{' '}
                  <span className="text-muted-foreground text-xs font-normal">
                    · {row.customerName}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  {row.channel} · {row.type} · {new Date(row.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${STATUS_CLASSES[row.status] ?? 'bg-muted text-muted-foreground'}`}
                >
                  {row.status}
                </span>
                <span className="text-foreground font-mono text-sm">{row.totalLabel}</span>
                <Link
                  href={`/admin/orders/${row.id}`}
                  className="text-foreground text-xs underline"
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
