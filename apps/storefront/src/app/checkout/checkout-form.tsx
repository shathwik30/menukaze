'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { computeTax, type TaxRule } from '@menukaze/shared';
import '@menukaze/shared/razorpay-client';
import { Badge, Button, Card, FieldError, Input, Label, Radio, cn } from '@menukaze/ui';
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
  taxRules: TaxRule[];
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
  taxRules,
}: Props) {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const increment = useCart((s) => s.incrementLine);
  const decrement = useCart((s) => s.decrementLine);
  const remove = useCart((s) => s.removeLine);
  const setNotes = useCart((s) => s.setNotes);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = useMemo(() => cartSubtotalMinor(lines), [lines]);
  const deliveryFee = orderType === 'delivery' ? deliveryFeeMinor : 0;
  const { taxMinor, surchargeMinor } = useMemo(
    () => computeTax(subtotal, taxRules),
    [subtotal, taxRules],
  );
  const total = subtotal + surchargeMinor + deliveryFee;
  const belowMinimum = minimumOrderMinor > 0 && subtotal < minimumOrderMinor;
  const formatMoney = (minor: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);

  if (lines.length === 0) {
    return (
      <Card variant="surface" radius="lg" className="px-6 py-16 text-center">
        <div className="bg-canvas-200 text-ink-700 dark:bg-ink-800 dark:text-ink-300 mx-auto flex size-14 items-center justify-center rounded-2xl">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
            aria-hidden
          >
            <circle cx="8" cy="21" r="1" />
            <circle cx="19" cy="21" r="1" />
            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
          </svg>
        </div>
        <h2 className="text-foreground mt-4 font-serif text-xl font-medium">Your cart is empty</h2>
        <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">
          Pick a few dishes to get started.
        </p>
        <Link href="/" className="mt-6 inline-flex">
          <Button variant="primary" size="md">
            Browse menu
          </Button>
        </Link>
      </Card>
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
      setError('Payment is loading — please retry in a moment.');
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
      theme: { color: '#c38d3a' },
      handler: (response) => {
        void (async () => {
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
        })();
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

      <Card variant="surface" radius="lg" className="overflow-hidden">
        <div className="border-ink-100 dark:border-ink-800 flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-ink-600 dark:text-ink-400 text-sm font-semibold tracking-[0.14em] uppercase">
            Your order
          </h2>
          <span className="text-ink-500 dark:text-ink-400 text-sm">
            {lines.reduce((acc, l) => acc + l.quantity, 0)} items
          </span>
        </div>
        <ul className="divide-ink-100 dark:divide-ink-800 divide-y">
          {lines.map((line) => {
            const key = cartLineKey(line);
            const unitMinor =
              line.priceMinor + line.modifiers.reduce((s, m) => s + m.priceMinor, 0);
            return (
              <li key={key} className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate font-serif text-base font-medium">
                        {line.name}
                      </p>
                      {line.modifiers.length > 0 ? (
                        <p className="text-ink-500 dark:text-ink-400 mt-0.5 text-[12.5px]">
                          {line.modifiers.map((m) => m.optionName).join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    <span className="mk-nums text-foreground shrink-0 font-serif text-base font-medium tabular-nums">
                      {formatMoney(unitMinor * line.quantity)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="border-ink-200 bg-surface dark:border-ink-700 dark:bg-ink-800 inline-flex items-center rounded-full border p-0.5">
                      <Button
                        type="button"
                        onClick={() => decrement(key)}
                        variant="plain"
                        size="none"
                        className="text-ink-600 hover:bg-canvas-100 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-ink-700 flex size-7 items-center justify-center rounded-full transition-colors"
                        aria-label="Decrease"
                      >
                        −
                      </Button>
                      <span className="mk-nums w-7 text-center text-sm font-medium tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        onClick={() => increment(key)}
                        variant="plain"
                        size="none"
                        className="text-ink-600 hover:bg-canvas-100 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-ink-700 flex size-7 items-center justify-center rounded-full transition-colors"
                        aria-label="Increase"
                      >
                        +
                      </Button>
                    </div>
                    <Button
                      type="button"
                      onClick={() => remove(key)}
                      variant="link"
                      size="xs"
                      className="text-ink-500 hover:text-mkrose-700 dark:text-ink-400 dark:hover:text-mkrose-400 ml-1 text-xs underline-offset-4 transition-colors hover:underline"
                    >
                      Remove
                    </Button>
                  </div>
                  <Input
                    type="text"
                    value={line.notes ?? ''}
                    onChange={(event) => setNotes(key, event.target.value)}
                    placeholder="Special instructions (optional)"
                    maxLength={200}
                    className="mt-3 h-9 text-[13px]"
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-ink-100 bg-canvas-50 dark:border-ink-800 dark:bg-ink-900/60 space-y-1.5 border-t px-6 py-4 text-sm">
          <Row label="Subtotal" value={formatMoney(subtotal)} />
          {taxMinor > 0 ? <Row label="Tax" value={formatMoney(taxMinor)} /> : null}
          {orderType === 'delivery' && deliveryFeeMinor > 0 ? (
            <Row label="Delivery fee" value={formatMoney(deliveryFeeMinor)} />
          ) : null}
          <div className="border-ink-200 dark:border-ink-700 mt-3 flex items-center justify-between border-t pt-3">
            <span className="font-serif text-lg font-medium">Total</span>
            <span className="mk-nums font-serif text-2xl font-medium tracking-tight tabular-nums">
              {formatMoney(total)}
            </span>
          </div>
        </div>

        {belowMinimum ? (
          <div className="border-mkrose-200 bg-mkrose-50 text-mkrose-800 dark:border-mkrose-500/30 dark:bg-mkrose-500/10 dark:text-mkrose-300 border-t px-6 py-3 text-[13px] font-medium">
            Minimum order is {formatMoney(minimumOrderMinor)}. Add a little more to continue.
          </div>
        ) : null}
        <div className="border-ink-100 bg-canvas-50 text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400 flex items-center gap-2 border-t px-6 py-3 text-xs">
          <ClockIcon />
          Ready in ~{estimatedPrepMinutes} minutes after confirmation
        </div>
      </Card>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        <fieldset>
          <legend className="text-ink-600 dark:text-ink-400 mb-2 text-[11px] font-semibold tracking-[0.14em] uppercase">
            Order type
          </legend>
          <div className="border-ink-200 bg-canvas-100 dark:border-ink-800 dark:bg-ink-900 grid grid-cols-2 gap-2 rounded-xl border p-1">
            {(['pickup', 'delivery'] as const).map((type) => {
              const active = orderType === type;
              return (
                <label
                  key={type}
                  className={cn(
                    'relative flex cursor-pointer items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium capitalize transition-all duration-200',
                    active
                      ? 'bg-surface text-ink-950 ring-ink-200 dark:bg-ink-700 dark:text-canvas-50 dark:ring-ink-600 shadow-sm ring-1'
                      : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-canvas-100',
                  )}
                >
                  <Radio
                    name="orderType"
                    value={type}
                    checked={active}
                    onChange={() => setOrderType(type)}
                    className="sr-only"
                  />
                  {type === 'pickup' ? <BagIcon /> : <TruckIcon />}
                  {type}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="co-name" required>
              Name
            </Label>
            <Input
              id="co-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Jane Doe"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="co-email" required>
              Email
            </Label>
            <Input
              id="co-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="jane@example.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="co-phone">Phone</Label>
            <Input
              id="co-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="For SMS order updates"
            />
          </div>
        </div>

        {error ? <FieldError>{error}</FieldError> : null}

        {!razorpayReady ? (
          <div className="border-ink-200 bg-canvas-100 text-ink-600 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300 rounded-lg border px-4 py-3 text-xs">
            <Badge variant="warning" size="xs" shape="pill" className="mb-2">
              Setup incomplete
            </Badge>
            <p>{restaurantName} is still finishing payment setup — ordering will be live soon.</p>
          </div>
        ) : null}

        <Button
          type="submit"
          size="xl"
          variant="primary"
          full
          loading={submitting}
          disabled={submitting || !razorpayReady || belowMinimum}
        >
          {submitting ? 'Processing' : `Pay ${formatMoney(total)}`}
        </Button>

        <p className="text-ink-400 dark:text-ink-500 flex items-center justify-center gap-1.5 text-[11px]">
          <LockIcon />
          Secured by Razorpay · PCI-DSS compliant
        </p>
      </form>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-600 dark:text-ink-400">{label}</span>
      <span className="mk-nums text-foreground font-mono tabular-nums">{value}</span>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function BagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
function TruckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M5 18H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h11v13" />
      <path d="M14 9h4l4 4v5h-2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
      aria-hidden
    >
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
