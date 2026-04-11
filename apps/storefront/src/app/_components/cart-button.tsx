'use client';

import Link from 'next/link';
import { useCart, cartItemCount, cartSubtotalMinor } from '@/stores/cart';

/**
 * Floating cart CTA visible on every storefront page. Shows a count badge
 * and the running subtotal. Clicking navigates to /checkout.
 */
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
    <Link
      href="/checkout"
      className="bg-primary text-primary-foreground hover:bg-primary/90 fixed bottom-6 left-1/2 z-40 inline-flex h-12 -translate-x-1/2 items-center gap-3 rounded-full px-5 text-sm font-semibold shadow-lg"
    >
      <span className="bg-primary-foreground text-primary inline-flex h-6 w-6 items-center justify-center rounded-full text-xs">
        {count}
      </span>
      <span>View cart</span>
      <span className="font-mono">{formatted}</span>
    </Link>
  );
}
