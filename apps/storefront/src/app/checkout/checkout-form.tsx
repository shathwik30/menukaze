'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { cartLineKey, cartSubtotalMinor, useCart } from '@/stores/cart';
import {
  createPaymentIntentAction,
  verifyPaymentAction,
  type CheckoutInput,
} from '@/app/actions/checkout';

interface Props {
  restaurantId: string;
  restaurantName: string;
  currency: string;
  locale: string;
  razorpayReady: boolean;
  minimumOrderMinor: number;
  deliveryFeeMinor: number;
  estimatedPrepMinutes: number;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}
interface RazorpayCheckoutInstance {
  open: () => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}

export function CheckoutForm({
  restaurantId,
  restaurantName,
  currency,
  locale,
  razorpayReady,
  minimumOrderMinor,
  deliveryFeeMinor,
  estimatedPrepMinutes,
}: Props) {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const increment = useCart((s) => s.incrementLine);
  const decrement = useCart((s) => s.decrementLine);
  const remove = useCart((s) => s.removeLine);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = useMemo(() => cartSubtotalMinor(lines), [lines]);
  const deliveryFee = orderType === 'delivery' ? deliveryFeeMinor : 0;
  const total = subtotal + deliveryFee;
  const belowMinimum = minimumOrderMinor > 0 && subtotal < minimumOrderMinor;
  const formatMoney = (minor: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);

  if (lines.length === 0) {
    return (
      <div className="border-border rounded-lg border p-6 text-center">
        <p className="text-muted-foreground text-sm">Your cart is empty.</p>
        <Link
          href="/"
          className="bg-primary text-primary-foreground mt-4 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium"
        >
          Browse menu
        </Link>
      </div>
    );
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload: CheckoutInput = {
      restaurantId,
      type: orderType,
      customer: { name, email, ...(phone ? { phone } : {}) },
      lines: lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        modifiers: l.modifiers,
        ...(l.notes ? { notes: l.notes } : {}),
      })),
    };

    const intent = await createPaymentIntentAction(payload);
    if (!intent.ok) {
      setError(intent.error);
      setSubmitting(false);
      return;
    }

    if (typeof window === 'undefined' || !window.Razorpay) {
      setError('Razorpay checkout failed to load. Please refresh and try again.');
      setSubmitting(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: intent.razorpayKeyId,
      amount: intent.amountMinor,
      currency: intent.currency,
      name: restaurantName,
      description: `Order ${intent.publicOrderId}`,
      order_id: intent.razorpayOrderId,
      prefill: {
        name: intent.customer.name,
        email: intent.customer.email,
        ...(intent.customer.phone ? { contact: intent.customer.phone } : {}),
      },
      handler: async (response) => {
        const verified = await verifyPaymentAction({
          orderId: intent.orderId,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        if (!verified.ok) {
          setError(verified.error);
          setSubmitting(false);
          return;
        }
        clear();
        router.push(`/order/${intent.orderId}`);
      },
      modal: {
        ondismiss: () => {
          setSubmitting(false);
        },
      },
    });
    rzp.open();
  };

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Order summary</h2>
        <ul className="divide-border mt-3 divide-y">
          {lines.map((line) => {
            const key = cartLineKey(line);
            const unitMinor =
              line.priceMinor + line.modifiers.reduce((s, m) => s + m.priceMinor, 0);
            return (
              <li key={key} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-foreground truncate font-medium">{line.name}</p>
                  {line.modifiers.length > 0 ? (
                    <p className="text-muted-foreground text-xs">
                      {line.modifiers.map((m) => m.optionName).join(', ')}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decrement(key)}
                      className="border-input h-7 w-7 rounded-md border text-sm"
                      aria-label="Decrease"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => increment(key)}
                      className="border-input h-7 w-7 rounded-md border text-sm"
                      aria-label="Increase"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(key)}
                      className="text-muted-foreground ml-2 text-xs underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <span className="text-foreground shrink-0 font-mono text-sm">
                  {formatMoney(unitMinor * line.quantity)}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="border-border mt-3 flex flex-col gap-1 border-t pt-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">{formatMoney(subtotal)}</span>
          </div>
          {orderType === 'delivery' && deliveryFeeMinor > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Delivery fee</span>
              <span className="font-mono">{formatMoney(deliveryFeeMinor)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between font-semibold">
            <span>Total</span>
            <span className="font-mono text-base">{formatMoney(total)}</span>
          </div>
        </div>
        {belowMinimum ? (
          <p className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-xs">
            Minimum order is {formatMoney(minimumOrderMinor)}. Add more items to continue.
          </p>
        ) : null}
        <p className="text-muted-foreground mt-3 text-xs">
          Estimated ready in ~{estimatedPrepMinutes} minutes after confirmation.
        </p>
      </section>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <fieldset className="border-border flex gap-2 rounded-md border p-2">
          <legend className="text-muted-foreground px-1 text-xs uppercase tracking-wide">
            Order type
          </legend>
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 text-sm">
            <input
              type="radio"
              name="orderType"
              value="pickup"
              checked={orderType === 'pickup'}
              onChange={() => setOrderType('pickup')}
            />
            Pickup
          </label>
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 text-sm">
            <input
              type="radio"
              name="orderType"
              value="delivery"
              checked={orderType === 'delivery'}
              onChange={() => setOrderType('delivery')}
            />
            Delivery
          </label>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-input bg-background h-10 rounded-md border px-3 text-sm"
            autoComplete="name"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-input bg-background h-10 rounded-md border px-3 text-sm"
            autoComplete="email"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Phone (optional)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border-input bg-background h-10 rounded-md border px-3 text-sm"
            autoComplete="tel"
          />
        </label>

        {error ? (
          <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
        ) : null}

        {!razorpayReady ? (
          <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
            This restaurant hasn&apos;t finished setting up payments yet, so orders can&apos;t be
            placed just now.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !razorpayReady || belowMinimum}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Processing…' : `Pay ${formatMoney(total)}`}
        </button>
      </form>
    </>
  );
}
