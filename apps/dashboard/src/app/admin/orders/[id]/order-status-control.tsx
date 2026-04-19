'use client';

import { Button } from '@menukaze/ui';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ORDER_STATUS_TRANSITION_LABELS,
  ORDER_STATUS_TRANSITIONS,
  type OrderStatus,
} from '@menukaze/shared';
import { updateOrderStatusAction } from '@/app/actions/orders';

interface Props {
  orderId: string;
  currentStatus: OrderStatus;
}

interface TransitionChoice {
  next: OrderStatus;
  label: string;
}

function transitionChoicesFor(status: OrderStatus): TransitionChoice[] {
  return ORDER_STATUS_TRANSITIONS[status].map((next) => ({
    next,
    label: ORDER_STATUS_TRANSITION_LABELS[next],
  }));
}

export function OrderStatusControl({ orderId, currentStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const transitions = transitionChoicesFor(status);

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
        <Button
          variant="plain"
          size="none"
          key={t.next}
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            // Prompt inline so every cancellation records an audit reason.
            let cancelReason: string | undefined;
            if (t.next === 'cancelled') {
              const typed = window.prompt('Reason for cancelling this order?');
              cancelReason = typed?.trim();
              if (!cancelReason) return;
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
        </Button>
      ))}
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </div>
  );
}
