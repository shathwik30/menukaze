import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrandRow, Eyebrow } from '@menukaze/ui';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { CheckoutForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const restaurant = await resolveTenantOrNotFound();
  if (!restaurant.liveAt) notFound();

  return (
    <div className="bg-canvas-100 dark:bg-ink-950 min-h-screen">
      <div className="border-ink-100 bg-surface/80 dark:border-ink-900 dark:bg-ink-900/60 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-ink-600 hover:text-ink-950 dark:text-ink-400 dark:hover:text-canvas-50 inline-flex items-center gap-2 text-sm transition-colors"
          >
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
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to menu
          </Link>
          <BrandRow size="sm" />
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14">
        <header className="mb-8">
          <Eyebrow withBar tone="accent">
            Checkout
          </Eyebrow>
          <h1 className="text-foreground mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">
            Review &amp; pay
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-2 text-sm">
            Ordering from <span className="text-foreground font-medium">{restaurant.name}</span>
          </p>
        </header>

        <CheckoutForm
          restaurantId={String(restaurant._id)}
          restaurantName={restaurant.name}
          currency={restaurant.currency}
          locale={restaurant.locale}
          razorpayReady={Boolean(restaurant.razorpayKeyIdEnc)}
          minimumOrderMinor={restaurant.minimumOrderMinor ?? 0}
          deliveryFeeMinor={restaurant.deliveryFeeMinor ?? 0}
          estimatedPrepMinutes={restaurant.estimatedPrepMinutes ?? 20}
          taxRules={restaurant.taxRules ?? []}
        />
      </main>
    </div>
  );
}
