'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import { channels } from '@menukaze/realtime';
import '@menukaze/shared/razorpay-client';
import Script from 'next/script';
import {
  requestBillAction,
  requestCounterPaymentAction,
  verifySessionPaymentAction,
  callWaiterAction,
} from '@/app/actions/session';

export interface BillLine {
  name: string;
  quantity: number;
  lineTotalLabel: string;
}

export function BillClient({
  restaurantId,
  sessionId,
  status,
  paymentModeRequested,
  restaurantName,
  totalLabel,
}: {
  restaurantId: string;
  sessionId: string;
  status: 'active' | 'bill_requested' | 'paid' | 'closed' | 'needs_review';
  paymentModeRequested?: 'online' | 'counter';
  restaurantName: string;
  totalLabel: string;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [assistanceRequested, setAssistanceRequested] = useState(false);
  const [counterRequested, setCounterRequested] = useState(paymentModeRequested === 'counter');

  useEffect(() => {
    const tokenUrl = `/api/ably/token?sessionId=${encodeURIComponent(sessionId)}`;
    const client = new Ably.Realtime({ authUrl: tokenUrl });
    const channel = client.channels.get(channels.customerSession(restaurantId, sessionId));

    const handler = () => {
      router.refresh();
    };

    void channel.subscribe(handler);
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId, router, sessionId]);

  function requestAssistance() {
    setError(null);
    start(async () => {
      const result = await callWaiterAction(sessionId, 'payment_help');
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAssistanceRequested(true);
      window.setTimeout(() => setAssistanceRequested(false), 4000);
    });
  }

  function payAtCounter() {
    setError(null);
    start(async () => {
      const result = await requestCounterPaymentAction(sessionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCounterRequested(true);
      setAssistanceRequested(true);
      router.refresh();
      window.setTimeout(() => setAssistanceRequested(false), 4000);
    });
  }

  function pay() {
    setError(null);
    start(async () => {
      const intent = await requestBillAction(sessionId);
      if (!intent.ok) {
        setError(intent.error);
        return;
      }
      if (typeof window === 'undefined' || !window.Razorpay) {
        setError('Razorpay failed to load. Please refresh and try again.');
        return;
      }
      const rzp = new window.Razorpay({
        key: intent.razorpayKeyId,
        amount: intent.amountMinor,
        currency: intent.currency,
        name: intent.restaurantName,
        description: 'Dine-in bill',
        order_id: intent.razorpayOrderId,
        prefill: {
          name: intent.customer.name,
          email: intent.customer.email,
          ...(intent.customer.phone ? { contact: intent.customer.phone } : {}),
        },
        handler: (response) => {
          start(async () => {
            const verified = await verifySessionPaymentAction({
              sessionId: intent.sessionId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            });
            if (!verified.ok) {
              setError(verified.error);
              return;
            }
            setPaid(true);
            router.refresh();
          });
        },
        // Omitting `ondismiss` leaves the bill retryable after modal dismissal.
      });
      rzp.open();
    });
  }

  if (paid) {
    return (
      <section className="border-border rounded-lg border p-6 text-center">
        <h2 className="text-xl font-bold">Thanks for dining with us!</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Your receipt is on its way. You&apos;re all set to leave.
        </p>
      </section>
    );
  }

  if (status === 'needs_review') {
    return (
      <section className="border-border rounded-lg border p-5">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          This session timed out with payment still pending. A waiter needs to help complete the
          bill.
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={requestAssistance}
          className="border-input mt-4 h-10 w-full rounded-md border text-sm font-semibold disabled:opacity-50"
        >
          {assistanceRequested ? 'Assistance requested ✓' : 'Request assistance'}
        </button>
        {error ? (
          <p className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  if (counterRequested) {
    return (
      <section className="border-border rounded-lg border p-5">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Counter payment requested. A waiter or cashier will help complete this bill using cash or
          the card terminal.
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={requestAssistance}
          className="border-input mt-4 h-10 w-full rounded-md border text-sm font-semibold disabled:opacity-50"
        >
          {assistanceRequested ? 'Assistance requested ✓' : 'Request assistance again'}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setCounterRequested(false)}
          className="border-input mt-2 h-10 w-full rounded-md border text-sm font-semibold disabled:opacity-50"
        >
          Switch back to online payment
        </button>
        {error ? (
          <p className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <section className="border-border rounded-lg border p-5">
        <p className="text-muted-foreground text-xs">
          Tap Pay to settle the bill via Razorpay. If the payment fails, retry or request assistance
          for cash / terminal checkout.
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={pay}
          className="bg-primary text-primary-foreground mt-4 h-11 w-full rounded-md text-sm font-semibold disabled:opacity-50"
        >
          {isPending ? 'Processing…' : `Pay ${totalLabel}`}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={payAtCounter}
          className="border-input mt-2 h-10 w-full rounded-md border text-sm font-semibold disabled:opacity-50"
        >
          {assistanceRequested ? 'Counter payment requested ✓' : 'Pay at counter'}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={requestAssistance}
          className="border-input mt-2 h-10 w-full rounded-md border text-sm font-semibold disabled:opacity-50"
        >
          Request assistance
        </button>
        {error ? (
          <p className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
      </section>
      <p className="text-muted-foreground mt-2 text-[11px]">
        Paying {restaurantName} · Razorpay test mode
      </p>
    </>
  );
}
