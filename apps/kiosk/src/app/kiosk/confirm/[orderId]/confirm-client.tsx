'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import { isOrderStatusChangedEvent, type OrderStatus } from '@menukaze/realtime';

const RESET_AFTER_MS = 30_000; // 30 s then back to attract screen

interface Props {
  restaurantId: string;
  orderId: string;
  publicOrderId: string;
  customerName: string;
  totalLabel: string;
  itemLines: Array<{ name: string; quantity: number }>;
  estimatedPrepMinutes: number;
}

const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  received: 'Order received',
  confirmed: 'Confirmed — being prepared',
  preparing: 'Being prepared',
  ready: 'Ready for collection!',
  completed: 'Completed',
};

export function ConfirmClient({
  restaurantId,
  orderId,
  publicOrderId,
  customerName,
  totalLabel,
  itemLines,
  estimatedPrepMinutes,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>('confirmed');
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
          router.push('/kiosk');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [router]);

  const statusReady = status === 'ready';

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-8 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      {/* Token number */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-lg font-medium uppercase tracking-widest text-white/60">Order number</p>
        <p className="text-[120px] font-extrabold leading-none tracking-tight text-white">
          {publicOrderId}
        </p>
      </div>

      {/* Status badge */}
      <div
        className={`rounded-2xl px-6 py-3 text-xl font-bold ${
          statusReady ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white'
        }`}
      >
        {STATUS_LABEL[status] ?? status}
      </div>

      {/* Summary */}
      <div className="flex max-w-sm flex-col items-center gap-1 text-center">
        <p className="text-white/70">
          Hi {customerName} · {totalLabel}
        </p>
        <p className="text-sm text-white/50">
          {itemLines.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
        </p>
        <p className="mt-2 text-sm text-white/50">Ready in ~{estimatedPrepMinutes} minutes</p>
      </div>

      {/* Auto-reset notice */}
      <p className="text-sm text-white/30">New order in {countdown}s…</p>

      <button
        type="button"
        onClick={() => router.push('/kiosk')}
        className="mt-2 rounded-2xl bg-white/10 px-8 py-3 text-base font-semibold text-white active:bg-white/20"
      >
        Start new order
      </button>
    </div>
  );
}
