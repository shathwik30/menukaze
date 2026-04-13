'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { computeTax, type TaxRule } from '@menukaze/shared';
import { cartItemCount, cartLineKey, cartSubtotalMinor, useKioskCart } from '@/stores/cart';
import { useIdleReset } from '@/hooks/use-idle-reset';
import { PinOverlay } from '@/components/pin-overlay';
import { createKioskOrderAction, verifyKioskPaymentAction } from '@/app/actions/kiosk';

interface RazorpayOpts {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (r: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  prefill?: { name?: string };
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance {
  open: () => void;
}
declare global {
  interface Window {
    Razorpay?: new (o: RazorpayOpts) => RazorpayInstance;
  }
}

interface Props {
  restaurantId: string;
  restaurantName: string;
  currency: string;
  locale: string;
  razorpayReady: boolean;
  taxRules: TaxRule[];
  minimumOrderMinor: number;
  estimatedPrepMinutes: number;
}

// ── Numeric on-screen keyboard ──────────────────────────────────────────────
function NumPad({
  onDigit,
  onBack,
  onSpace,
}: {
  onDigit: (d: string) => void;
  onBack: () => void;
  onSpace: () => void;
}) {
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['⌫', '0', ' '],
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {rows.flat().map((key, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            if (key === '⌫') onBack();
            else if (key === ' ') onSpace();
            else onDigit(key);
          }}
          className="h-14 rounded-xl bg-slate-100 text-xl font-semibold text-slate-900 active:bg-slate-200"
        >
          {key === ' ' ? 'Space' : key}
        </button>
      ))}
    </div>
  );
}

export function CheckoutClient({
  restaurantId,
  restaurantName,
  currency,
  locale,
  razorpayReady,
  taxRules,
  minimumOrderMinor,
  estimatedPrepMinutes,
}: Props) {
  const router = useRouter();
  useIdleReset();

  const lines = useKioskCart((s) => s.lines);
  const orderMode = useKioskCart((s) => s.orderMode);
  const clear = useKioskCart((s) => s.clear);

  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = (minor: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);

  // Bounce if cart is empty or no mode selected
  useEffect(() => {
    if (!orderMode || lines.length === 0) router.replace('/kiosk/menu');
  }, [orderMode, lines.length, router]);

  const subtotal = useMemo(() => cartSubtotalMinor(lines), [lines]);
  const { surchargeMinor, taxMinor } = useMemo(
    () => computeTax(subtotal, taxRules),
    [subtotal, taxRules],
  );
  const total = subtotal + surchargeMinor;
  const itemCount = cartItemCount(lines);
  const belowMinimum = minimumOrderMinor > 0 && subtotal < minimumOrderMinor;

  async function pay() {
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (belowMinimum) {
      setError(`Minimum order is ${fmt(minimumOrderMinor)}.`);
      return;
    }
    setError(null);
    setSubmitting(true);

    const intent = await createKioskOrderAction({
      restaurantId,
      orderMode: orderMode ?? 'dine_in',
      customerName: name.trim(),
      lines: lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        modifiers: l.modifiers,
        ...(l.notes ? { notes: l.notes } : {}),
      })),
    });

    if (!intent.ok) {
      setError(intent.error);
      setSubmitting(false);
      return;
    }

    if (!window.Razorpay) {
      setError('Razorpay failed to load. Please try again or call staff.');
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
      prefill: { name: intent.customerName },
      handler: (response) => {
        void (async () => {
          const verified = await verifyKioskPaymentAction({
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
          router.push(`/kiosk/confirm/${verified.orderId}`);
        })();
      },
      modal: {
        ondismiss: () => setSubmitting(false),
      },
    });
    rzp.open();
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div className="flex h-screen flex-col bg-white">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <button
            type="button"
            onClick={() => router.push('/kiosk/menu')}
            className="text-muted-foreground text-sm underline"
          >
            ← Back to menu
          </button>
          <span className="font-semibold">Review & Pay</span>
          <div className="w-28" />
        </header>

        <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">
          {/* Order summary (left) */}
          <div className="flex w-1/2 flex-col overflow-y-auto border-r p-6">
            <h2 className="mb-4 text-lg font-bold">
              Your order · {itemCount} item{itemCount !== 1 ? 's' : ''}
            </h2>
            <ul className="flex flex-col gap-3">
              {lines.map((line) => {
                const key = cartLineKey(line);
                const unitMinor =
                  line.priceMinor + line.modifiers.reduce((s, m) => s + m.priceMinor, 0);
                return (
                  <li key={key} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {line.quantity}× {line.name}
                      </p>
                      {line.modifiers.length > 0 ? (
                        <p className="text-muted-foreground text-xs">
                          {line.modifiers.map((m) => m.optionName).join(', ')}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-mono text-sm">
                      {fmt(unitMinor * line.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{fmt(subtotal)}</span>
              </div>
              {taxMinor > 0 ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-mono">{fmt(taxMinor)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex justify-between text-xl font-bold">
                <span>Total</span>
                <span className="font-mono">{fmt(total)}</span>
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                Ready in ~{estimatedPrepMinutes} min ·{' '}
                {orderMode === 'dine_in' ? 'Dine in' : 'Takeaway'}
              </p>
            </div>
          </div>

          {/* Name entry + pay (right) */}
          <div className="flex w-1/2 flex-col p-6">
            <h2 className="mb-4 text-lg font-bold">Your name</h2>
            <div className="mb-4 flex h-14 items-center rounded-2xl border bg-slate-50 px-4 text-2xl font-medium tracking-wide">
              {name || <span className="text-base text-slate-300">Enter your name</span>}
            </div>

            <NumPad
              onDigit={(d) => setName((n) => n + d)}
              onBack={() => setName((n) => n.slice(0, -1))}
              onSpace={() => setName((n) => (n.endsWith(' ') ? n : n + ' '))}
            />

            {/* Also show a real text input as fallback for attached keyboard */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Or type here…"
              className="border-input bg-background mt-3 h-10 rounded-xl border px-4 text-sm"
            />

            {error ? (
              <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
            ) : null}

            {!razorpayReady ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
                Payments are not set up for this restaurant yet.
              </p>
            ) : null}

            <button
              type="button"
              disabled={submitting || !razorpayReady || belowMinimum || !name.trim()}
              onClick={() => void pay()}
              className="mt-auto h-16 w-full rounded-2xl bg-slate-900 text-xl font-bold text-white active:bg-slate-700 disabled:opacity-40"
            >
              {submitting ? 'Processing…' : `Pay ${fmt(total)}`}
            </button>
          </div>
        </div>

        <PinOverlay />
      </div>
    </>
  );
}
