'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderStatus } from '@menukaze/realtime';
import { updateOrderStatusAction } from '@/app/actions/orders';

interface Props {
  orderId: string;
  currentStatus: OrderStatus;
}

/**
 * Mirrors the server-side NEXT_STATUSES map so the UI only shows legal
 * transitions. The server is still the source of truth — updateOrderStatusAction
 * re-validates before touching the DB.
 */
const NEXT_STATUSES: Record<OrderStatus, { next: OrderStatus; label: string }[]> = {
  received: [
    { next: 'confirmed', label: 'Confirm' },
    { next: 'cancelled', label: 'Cancel' },
  ],
  confirmed: [
    { next: 'preparing', label: 'Start preparing' },
    { next: 'cancelled', label: 'Cancel' },
  ],
  preparing: [
    { next: 'ready', label: 'Mark ready' },
    { next: 'cancelled', label: 'Cancel' },
  ],
  ready: [
    { next: 'served', label: 'Served' },
    { next: 'out_for_delivery', label: 'Out for delivery' },
    { next: 'completed', label: 'Complete' },
    { next: 'cancelled', label: 'Cancel' },
  ],
  served: [{ next: 'completed', label: 'Complete' }],
  out_for_delivery: [
    { next: 'delivered', label: 'Delivered' },
    { next: 'cancelled', label: 'Cancel' },
  ],
  delivered: [{ next: 'completed', label: 'Complete' }],
  completed: [],
  cancelled: [],
};

export function OrderStatusControl({ orderId, currentStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const transitions = NEXT_STATUSES[status];

  if (transitions.length === 0) {
    return (
      <p className="text-muted-foreground mt-2 text-xs">Terminal state: no further transitions.</p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-foreground font-semibold">{status}</span>
      <span className="text-muted-foreground">→</span>
      {transitions.map((t) => (
        <button
          key={t.next}
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            // Cancel requires a reason per spec §5 line 205 — we prompt
            // inline here rather than a modal to keep the UI minimal.
            let cancelReason: string | undefined;
            if (t.next === 'cancelled') {
              const typed = window.prompt('Reason for cancelling this order?');
              if (!typed || !typed.trim()) return;
              cancelReason = typed.trim();
            }
            start(async () => {
              const result = await updateOrderStatusAction({
                orderId,
                nextStatus: t.next,
                ...(cancelReason ? { cancelReason } : {}),
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setStatus(result.status);
              router.refresh();
            });
          }}
          className={
            t.next === 'cancelled'
              ? 'border-destructive text-destructive hover:bg-destructive/10 rounded-md border px-3 py-1 text-xs disabled:opacity-50'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 text-xs disabled:opacity-50'
          }
        >
          {isPending ? '…' : t.label}
        </button>
      ))}
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </div>
  );
}
