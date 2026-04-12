import { notFound } from 'next/navigation';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { CheckoutForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const restaurant = await resolveTenantOrNotFound();
  if (!restaurant.liveAt) notFound();

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Checkout</h1>
        <p className="text-muted-foreground text-sm">{restaurant.name}</p>
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
  );
}
