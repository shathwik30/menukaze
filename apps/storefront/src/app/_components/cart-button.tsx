'use client';

import Link from 'next/link';
import { useCart, cartItemCount, cartSubtotalMinor } from '@/stores/cart';

export function CartButton() {
  const lines = useCart((s) => s.lines);
  const currency = useCart((s) => s.currency);
  const locale = useCart((s) => s.locale);
  const count = cartItemCount(lines);

  if (count === 0) return null;

  const subtotal = cartSubtotalMinor(lines);
  const formatted =
    currency && locale
      ? new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          maximumFractionDigits: 2,
        }).format(subtotal / 100)
      : `${subtotal}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5 sm:pb-7">
      <Link
        href="/checkout"
        className="bg-ink-950 text-canvas-50 ring-ink-950/10 dark:bg-canvas-50 dark:text-ink-950 dark:ring-canvas-50/10 group pointer-events-auto inline-flex h-14 animate-[slide-up_400ms_var(--ease-spring)] items-center gap-4 rounded-full pr-6 pl-2 text-sm font-medium shadow-[0_20px_40px_-10px_oklch(0.14_0.016_90/0.45)] ring-1 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-12px_oklch(0.14_0.016_90/0.55)] active:translate-y-0"
        style={{ animationFillMode: 'backwards' }}
      >
        <span className="bg-saffron-500 flex size-10 items-center justify-center rounded-full text-[13px] font-semibold text-white ring-1 ring-black/5 transition-transform duration-300 group-hover:rotate-6">
          {count}
        </span>
        <span className="flex items-baseline gap-3">
          <span className="tracking-tight">View cart</span>
          <span className="mk-nums font-mono text-[13px] opacity-70">{formatted}</span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 opacity-70 transition-transform duration-300 group-hover:translate-x-0.5"
          aria-hidden
        >
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
