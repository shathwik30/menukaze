'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import { isOrderStatusChangedEvent, type OrderStatus } from '@menukaze/realtime';
import { formatPickupNumber } from '@menukaze/shared';

const RESET_AFTER_MS = 120_000;

interface Props {
  restaurantId: string;
  orderId: string;
  publicOrderId: string;
  initialStatus: OrderStatus;
  customerName: string;
  totalLabel: string;
  itemLines: Array<{ name: string; quantity: number }>;
  estimatedPrepMinutes: number;
  readyTimeLabel: string;
  orderTypeLabel: string;
  paid: boolean;
}

const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  received: 'Order received',
  confirmed: 'Confirmed',
  preparing: 'Being prepared',
  ready: 'Ready for collection',
  served: 'Served',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_ORDER: OrderStatus[] = ['received', 'confirmed', 'preparing', 'ready', 'completed'];

export function ConfirmClient({
  restaurantId,
  orderId,
  publicOrderId,
  initialStatus,
  customerName,
  totalLabel,
  itemLines,
  estimatedPrepMinutes,
  readyTimeLabel,
  orderTypeLabel,
  paid,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [countdown, setCountdown] = useState(Math.round(RESET_AFTER_MS / 1000));

  // Subscribe to order status updates via Ably
  useEffect(() => {
    const tokenUrl = `/api/ably/token?orderId=${encodeURIComponent(orderId)}`;
    const client = new Ably.Realtime({ authUrl: tokenUrl });

    const channelName = `restaurant:${restaurantId}:order:${orderId}`;
    const channel = client.channels.get(channelName);
    const handler = (msg: Ably.Message) => {
      if (msg.name !== 'order.status_changed') return;
      if (!isOrderStatusChangedEvent(msg.data)) return;
      if (msg.data.orderId === orderId) setStatus(msg.data.status);
    };
    channel.subscribe(handler).catch(() => {
      /* unmounted before subscribe resolved */
    });
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId, orderId]);

  // Auto-reset countdown
  useEffect(() => {
    const tick = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          router.replace('/kiosk');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [router]);

  const statusReady = status === 'ready';
  const currentRank = Math.max(STATUS_ORDER.indexOf(status), paid ? 1 : 0);
  const pickupNumber = formatPickupNumber(publicOrderId);

  return (
    <div className="grid h-screen grid-cols-[1.1fr_0.9fr] bg-zinc-950 text-white">
      <main className="flex min-h-0 flex-col justify-between px-14 py-12">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">
            Order confirmed
          </p>
          <h1 className="mt-4 text-6xl font-black leading-none tracking-tight">
            Keep this number.
          </h1>
        </div>

        <div>
          <p className="text-xl font-bold uppercase tracking-[0.22em] text-white/55">
            Pickup number
          </p>
          <div className="mt-4 flex items-end gap-5">
            <p className="text-[190px] font-black leading-none tracking-tight">{pickupNumber}</p>
          </div>
          <p className="mt-4 max-w-2xl text-3xl font-bold leading-tight text-white/75">
            Listen for this number. Your full reference is {publicOrderId}.
          </p>
        </div>

        <div className="grid max-w-3xl grid-cols-3 gap-3">
          <div className="rounded-lg border border-white/15 bg-white/5 p-4">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/45">Name</p>
            <p className="mt-2 text-2xl font-black">{customerName}</p>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/5 p-4">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/45">Total</p>
            <p className="mt-2 font-mono text-2xl font-black">{totalLabel}</p>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/5 p-4">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/45">Type</p>
            <p className="mt-2 text-2xl font-black">{orderTypeLabel}</p>
          </div>
        </div>
      </main>

      <aside className="flex min-h-0 flex-col bg-white text-zinc-950">
        <div className="border-b border-zinc-200 p-6">
          <div
            className={`inline-flex rounded-lg px-4 py-2 text-base font-black ${
              statusReady ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-950 text-white'
            }`}
          >
            {STATUS_LABEL[status] ?? status}
          </div>
          <h2 className="mt-5 text-4xl font-black">Listen for {pickupNumber}</h2>
          <p className="mt-3 text-lg leading-relaxed text-zinc-600">
            Full reference {publicOrderId}. Estimated ready time is {readyTimeLabel}. Most orders
            take about {estimatedPrepMinutes} minutes.
          </p>
        </div>

        <div className="border-b border-zinc-200 p-6">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-zinc-500">Progress</p>
          <div className="mt-5 flex flex-col gap-3">
            {STATUS_ORDER.slice(0, 4).map((step, index) => {
              const reached = currentRank >= index;
              return (
                <div key={step} className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-black ${
                      reached ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-100 text-zinc-400'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={reached ? 'text-lg font-black' : 'text-lg font-bold text-zinc-400'}
                  >
                    {STATUS_LABEL[step] ?? step}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-zinc-500">
            Order items
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {itemLines.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="flex justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-base"
              >
                <span className="font-bold">{item.name}</span>
                <span className="font-mono font-black">x{item.quantity}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-zinc-200 p-6">
          <p className="mb-3 text-center text-sm font-bold text-zinc-500">
            New order screen in {countdown}s
          </p>
          <button
            type="button"
            onClick={() => router.replace('/kiosk')}
            className="h-16 w-full rounded-lg bg-zinc-950 text-xl font-black text-white active:bg-zinc-800"
          >
            Start new order
          </button>
        </div>
      </aside>
    </div>
  );
}
