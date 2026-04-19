'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import { isOrderStatusChangedEvent, type OrderStatus } from '@menukaze/realtime';
import { formatPickupNumber } from '@menukaze/shared';
import { Button, cn } from '@menukaze/ui';

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
  received: 'Received',
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
      client.close();
    });
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId, orderId]);

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
    <div className="kiosk-confirm-layout bg-ink-950 text-canvas-50 relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 20% 30%, oklch(0.755 0.170 55 / 0.30), transparent 60%), radial-gradient(ellipse 60% 60% at 80% 80%, oklch(0.590 0.140 172 / 0.25), transparent 60%)',
        }}
      />

      <main className="relative flex min-h-0 flex-col justify-between px-14 py-12 portrait:px-8 portrait:py-10">
        <div>
          <p className="text-jade-300 inline-flex items-center gap-3 text-[13px] font-semibold tracking-[0.28em] uppercase">
            <span className="bg-jade-400 relative inline-flex size-2 rounded-full">
              <span className="bg-jade-400 absolute inset-0 animate-ping rounded-full opacity-60" />
            </span>
            Order confirmed
          </p>
          <h1 className="mt-5 font-serif text-[5.5rem] leading-[0.9] font-medium tracking-tight">
            Keep this <span className="text-saffron-400 italic">number.</span>
          </h1>
        </div>

        <div>
          <p className="text-canvas-50/55 text-xl font-medium tracking-[0.22em] uppercase">
            Pickup number
          </p>
          <p
            className="text-canvas-50 mt-6 font-serif leading-none font-medium tracking-[-0.05em]"
            style={{
              fontSize: 'clamp(10rem, 18vw, 18rem)',
              textShadow: '0 8px 40px oklch(0.695 0.185 48 / 0.2)',
            }}
          >
            {pickupNumber}
          </p>
          <p className="text-canvas-50/75 mt-6 max-w-2xl text-2xl leading-snug">
            Listen for this number. Your full reference is{' '}
            <span className="text-saffron-400 font-mono">{publicOrderId}</span>.
          </p>
        </div>

        <div className="grid max-w-3xl grid-cols-3 gap-4">
          <InfoTile label="Name" value={customerName} />
          <InfoTile label="Total" value={<span className="mk-nums font-mono">{totalLabel}</span>} />
          <InfoTile label="Type" value={orderTypeLabel} />
        </div>
      </main>

      <aside className="bg-canvas-50 text-ink-950 relative flex min-h-0 flex-col overflow-hidden">
        <div className="border-ink-100 border-b p-8">
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold',
              statusReady ? 'bg-jade-500 text-white' : 'bg-ink-950 text-canvas-50',
            )}
          >
            <span className="relative inline-flex size-2 rounded-full bg-current">
              {statusReady ? (
                <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
              ) : null}
            </span>
            {STATUS_LABEL[status] ?? status}
          </div>
          <h2 className="mt-6 font-serif text-4xl leading-tight font-medium tracking-tight">
            Listen for <span className="text-saffron-700 italic">{pickupNumber}</span>
          </h2>
          <p className="text-ink-600 mt-3 text-base leading-relaxed">
            Full reference <span className="text-ink-900 font-mono">{publicOrderId}</span>.
            Estimated ready at <span className="text-ink-900 font-medium">{readyTimeLabel}</span>.
            Most orders take about {estimatedPrepMinutes} minutes.
          </p>
        </div>

        <div className="border-ink-100 border-b p-8">
          <p className="text-ink-500 text-[11px] font-semibold tracking-[0.18em] uppercase">
            Progress
          </p>
          <ol className="mt-5 space-y-3">
            {STATUS_ORDER.slice(0, 4).map((step, index) => {
              const reached = currentRank >= index;
              const isCurrent = STATUS_ORDER[currentRank] === step;
              return (
                <li key={step} className="flex items-center gap-4">
                  <span
                    className={cn(
                      'relative flex size-10 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300',
                      reached
                        ? 'bg-jade-500 text-white'
                        : 'border-ink-200 bg-surface text-ink-400 border-2 border-dashed',
                    )}
                  >
                    {reached ? (
                      <svg
                        viewBox="0 0 16 16"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <polyline points="3 8 7 12 13 4" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                    {isCurrent ? (
                      <span className="bg-saffron-500/40 absolute inset-0 animate-ping rounded-full" />
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'font-serif text-lg leading-tight',
                      reached ? 'text-ink-950' : 'text-ink-400',
                    )}
                  >
                    {STATUS_LABEL[step] ?? step}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="kiosk-scroll min-h-0 flex-1 p-8">
          <p className="text-ink-500 text-[11px] font-semibold tracking-[0.18em] uppercase">
            Items
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {itemLines.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="border-ink-100 bg-surface flex items-center justify-between gap-4 rounded-xl border p-3 text-base"
              >
                <span className="font-serif font-medium">{item.name}</span>
                <span className="mk-nums bg-canvas-200 text-ink-700 rounded-md px-2 py-0.5 font-mono text-sm font-medium tabular-nums">
                  ×{item.quantity}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-ink-100 border-t p-8">
          <p className="text-ink-500 mb-3 text-center text-xs font-medium">
            New order screen in <span className="mk-nums tabular-nums">{countdown}s</span>
          </p>
          <Button
            type="button"
            onClick={() => router.replace('/kiosk')}
            size="2xl"
            full
            className="h-16 rounded-2xl font-serif text-xl font-medium"
          >
            Start new order
          </Button>
        </div>
      </aside>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
      <p className="text-canvas-50/45 text-[11px] font-semibold tracking-[0.22em] uppercase">
        {label}
      </p>
      <p className="text-canvas-50 mt-2 font-serif text-2xl font-medium">{value}</p>
    </div>
  );
}
