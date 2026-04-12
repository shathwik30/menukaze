'use client';

import { useEffect, useState } from 'react';
import * as Ably from 'ably';
import { isOrderStatusChangedEvent, type OrderStatus } from '@menukaze/realtime';

interface Props {
  restaurantId: string;
  orderId: string;
  channelName: string;
  initialStatus: OrderStatus;
  initialPaymentStatus: string;
}

const PROGRESS_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'received', label: 'Received' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready' },
  { status: 'completed', label: 'Completed' },
];

function stepIndex(status: OrderStatus): number {
  const idx = PROGRESS_STEPS.findIndex((s) => s.status === status);
  return idx === -1 ? 0 : idx;
}

/**
 * Subscribes to the customer order channel and renders a progress bar that
 * updates whenever the dashboard publishes a status change. Falls back to the
 * server-rendered initial status if the realtime connection never opens.
 */
export function OrderTracker({
  restaurantId,
  orderId,
  channelName,
  initialStatus,
  initialPaymentStatus,
}: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const tokenUrl = `/api/ably/token?orderId=${encodeURIComponent(orderId)}`;
    const client = new Ably.Realtime({ authUrl: tokenUrl });
    client.connection.on('connected', () => setConnected(true));
    client.connection.on('failed', () => setConnected(false));

    const channel = client.channels.get(channelName);
    const handler = (message: Ably.Message) => {
      if (message.name !== 'order.status_changed') return;
      if (!isOrderStatusChangedEvent(message.data)) return;
      const payload = message.data;
      if (payload.orderId === orderId) setStatus(payload.status);
    };
    void channel.subscribe(handler);

    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId, orderId, channelName]);

  const current = stepIndex(status);
  const cancelled = status === 'cancelled';

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Progress</h2>
        <span className="text-muted-foreground text-xs">
          {connected ? 'Live · updating in real time' : 'Connecting…'}
        </span>
      </div>

      {cancelled ? (
        <p className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-sm">
          This order was cancelled.
        </p>
      ) : (
        <ol className="mt-4 grid grid-cols-5 gap-2 text-center text-[11px]">
          {PROGRESS_STEPS.map((step, i) => {
            const reached = i <= current;
            return (
              <li key={step.status} className="flex flex-col items-center gap-1">
                <span
                  className={
                    reached
                      ? 'bg-primary text-primary-foreground inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px]'
                      : 'border-input text-muted-foreground inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px]'
                  }
                >
                  {i + 1}
                </span>
                <span className={reached ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-muted-foreground mt-6 text-xs">
        Status: {status} · Payment:{' '}
        {status === 'completed' || status === 'cancelled' ? 'captured' : initialPaymentStatus}
      </p>
    </section>
  );
}
