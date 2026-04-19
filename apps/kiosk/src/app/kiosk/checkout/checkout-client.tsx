'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { computeTax, formatPickupNumber, type TaxRule } from '@menukaze/shared';
import '@menukaze/shared/razorpay-client';
import { Button, FieldError, Input, Label } from '@menukaze/ui';
import { cartItemCount, cartLineKey, cartSubtotalMinor, useKioskCart } from '@/stores/cart';
import { useIdleReset } from '@/hooks/use-idle-reset';
import { createKioskOrderAction, verifyKioskPaymentAction } from '@/app/actions/kiosk';

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

function NameKeyboard({
  onLetter,
  onBack,
  onSpace,
  onClear,
}: {
  onLetter: (d: string) => void;
  onBack: () => void;
  onSpace: () => void;
  onClear: () => void;
}) {
  const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((row) => row.split(''));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.join('')} className="grid grid-cols-10 gap-2">
          {row.map((key) => (
            <Button
              key={key}
              type="button"
              onClick={() => onLetter(key)}
              variant="secondary"
              size="lg"
              className="h-14 text-lg font-black text-zinc-950 active:bg-zinc-200 portrait:h-16"
            >
              {key}
            </Button>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-[1fr_2fr_1fr] gap-2">
        <Button
          type="button"
          onClick={onClear}
          variant="secondary"
          size="lg"
          className="h-14 text-sm font-black text-zinc-700 active:bg-zinc-200 portrait:h-16"
        >
          Clear
        </Button>
        <Button
          type="button"
          onClick={onSpace}
          variant="secondary"
          size="lg"
          className="h-14 text-sm font-black text-zinc-700 active:bg-zinc-200 portrait:h-16"
        >
          Space
        </Button>
        <Button
          type="button"
          onClick={onBack}
          variant="secondary"
          size="lg"
          className="h-14 text-sm font-black text-zinc-700 active:bg-zinc-200 portrait:h-16"
        >
          Delete
        </Button>
      </div>
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

  const lines = useKioskCart((s) => s.lines);
  const orderMode = useKioskCart((s) => s.orderMode);
  const clear = useKioskCart((s) => s.clear);

  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [completingPayment, setCompletingPayment] = useState(false);
  useIdleReset(90_000, !submitting && !completingPayment);

  const fmt = (minor: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);

  useEffect(() => {
    if (completingPayment) return;
    if (!orderMode || lines.length === 0) router.replace('/kiosk/menu');
  }, [completingPayment, orderMode, lines.length, router]);

  const subtotal = useMemo(() => cartSubtotalMinor(lines), [lines]);
  const { surchargeMinor, taxMinor } = useMemo(
    () => computeTax(subtotal, taxRules),
    [subtotal, taxRules],
  );
  const total = subtotal + surchargeMinor;
  const itemCount = cartItemCount(lines);
  const belowMinimum = minimumOrderMinor > 0 && subtotal < minimumOrderMinor;

  async function pay() {
    if (belowMinimum) {
      setError(`Minimum order is ${fmt(minimumOrderMinor)}.`);
      return;
    }
    setError(null);
    setPendingReference(null);
    setSubmitting(true);
    const customerName = name.trim() || 'Guest';

    const intent = await createKioskOrderAction({
      restaurantId,
      orderMode: orderMode ?? 'dine_in',
      customerName,
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
    setPendingReference(intent.publicOrderId);

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
          setCompletingPayment(true);
          clear();
          router.replace(`/kiosk/confirm/${verified.orderId}`);
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
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <div className="kiosk-checkout-shell bg-zinc-50 text-zinc-950">
        <header className="kiosk-header flex items-center justify-between border-b border-zinc-200 bg-white">
          <Button
            type="button"
            onClick={() => router.push('/kiosk/menu')}
            variant="outline"
            size="xl"
            className="h-14 text-lg font-bold text-zinc-700 active:bg-zinc-100"
          >
            Back to menu
          </Button>
          <div className="text-center">
            <p className="text-xs font-bold tracking-[0.26em] text-emerald-700 uppercase">
              Step 3 of 3
            </p>
            <h1 className="text-2xl font-black">Review and pay</h1>
          </div>
          <div className="rounded-lg bg-zinc-950 px-4 py-3 text-sm font-black tracking-[0.18em] text-white uppercase">
            {orderMode === 'dine_in' ? 'Dine in' : 'Takeaway'}
          </div>
        </header>

        <div className="kiosk-checkout-content">
          <main className="kiosk-scroll min-h-0 p-6">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-sm font-bold tracking-[0.22em] text-zinc-500 uppercase">
                  Your order
                </p>
                <h2 className="mt-1 text-4xl font-black">
                  {itemCount} item{itemCount !== 1 ? 's' : ''}
                </h2>
              </div>
              <p className="rounded-lg bg-emerald-100 px-4 py-3 text-base font-black text-emerald-900">
                Ready in about {estimatedPrepMinutes} min
              </p>
            </div>

            <ul className="flex flex-col gap-3">
              {lines.map((line) => {
                const key = cartLineKey(line);
                const unitMinor =
                  line.priceMinor + line.modifiers.reduce((s, m) => s + m.priceMinor, 0);
                return (
                  <li
                    key={key}
                    className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4"
                  >
                    <div className="min-w-0">
                      <p className="text-xl font-black">
                        {line.quantity} x {line.name}
                      </p>
                      {line.modifiers.length > 0 ? (
                        <p className="mt-1 text-sm font-medium text-zinc-500">
                          {line.modifiers.map((m) => m.optionName).join(', ')}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-mono text-lg font-black">
                      {fmt(unitMinor * line.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </main>

          <aside className="kiosk-payment-panel flex min-h-0 flex-col bg-white">
            <div className="border-b border-zinc-200 p-5">
              <p className="text-xs font-bold tracking-[0.22em] text-zinc-500 uppercase">
                Payment total
              </p>
              <div className="mt-4 space-y-2 text-base">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span className="font-mono">{fmt(subtotal)}</span>
                </div>
                {taxMinor > 0 ? (
                  <div className="flex justify-between text-zinc-600">
                    <span>Tax</span>
                    <span className="font-mono">{fmt(taxMinor)}</span>
                  </div>
                ) : null}
                <div className="flex items-end justify-between border-t border-zinc-200 pt-3 text-3xl font-black">
                  <span>Total</span>
                  <span className="font-mono">{fmt(total)}</span>
                </div>
              </div>
            </div>

            <div className="kiosk-scroll min-h-0 flex-1 p-5">
              <label className="block">
                <Label className="text-sm font-black tracking-[0.18em] text-zinc-500 uppercase">
                  Name for pickup
                </Label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  placeholder="Optional"
                  className="mt-3 h-[4.5rem] w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 text-3xl font-black tracking-wide uppercase outline-none focus:border-emerald-600"
                />
              </label>
              <p className="mt-2 text-sm font-medium text-zinc-500">
                Leave blank to use Guest. Your order reference is shown after payment.
              </p>

              <div className="mt-5">
                <NameKeyboard
                  onLetter={(d) => setName((n) => (n.length >= 32 ? n : n + d))}
                  onBack={() => setName((n) => n.slice(0, -1))}
                  onSpace={() => setName((n) => (n.length >= 32 || n.endsWith(' ') ? n : `${n} `))}
                  onClear={() => setName('')}
                />
              </div>

              {error ? (
                <FieldError className="mt-4 rounded-lg bg-rose-100 px-4 py-3 text-sm font-bold text-rose-800">
                  {error}
                </FieldError>
              ) : null}

              {pendingReference ? (
                <p className="mt-4 rounded-lg bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-900">
                  Payment opened for pickup number {formatPickupNumber(pendingReference)}. Reference{' '}
                  {pendingReference}.
                </p>
              ) : null}

              {!razorpayReady ? (
                <p className="mt-4 rounded-lg bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900">
                  Payments are not set up for this restaurant yet.
                </p>
              ) : null}
            </div>

            <div className="border-t border-zinc-200 p-5">
              {belowMinimum ? (
                <p className="mb-3 rounded-lg bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900">
                  Minimum order is {fmt(minimumOrderMinor)}.
                </p>
              ) : null}
              <Button
                type="button"
                disabled={submitting || !razorpayReady || belowMinimum || itemCount === 0}
                onClick={() => void pay()}
                variant="accent"
                size="2xl"
                full
                loading={submitting}
                className="h-16 bg-emerald-500 text-xl font-black text-zinc-950 active:bg-emerald-400 disabled:bg-zinc-200 disabled:text-zinc-500"
              >
                Pay {fmt(total)}
              </Button>
              <p className="mt-3 text-center text-xs font-medium text-zinc-500">
                A pickup number appears after payment. Keep it visible for collection.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
