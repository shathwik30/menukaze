import { redirect } from 'next/navigation';
import { serializeTaxRules } from '@/lib/tax-rules';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { CheckoutClient } from './checkout-client';

export const dynamic = 'force-dynamic';

export default async function KioskCheckoutPage() {
  const restaurant = await resolveTenantOrNotFound();
  if (!restaurant.liveAt) redirect('/kiosk');

  const razorpayReady = Boolean(restaurant.razorpayKeyIdEnc && restaurant.razorpayKeySecretEnc);

  return (
    <CheckoutClient
      restaurantId={String(restaurant._id)}
      restaurantName={restaurant.name}
      currency={restaurant.currency}
      locale={restaurant.locale}
      razorpayReady={razorpayReady}
      taxRules={serializeTaxRules(restaurant.taxRules)}
      minimumOrderMinor={restaurant.minimumOrderMinor ?? 0}
      estimatedPrepMinutes={restaurant.estimatedPrepMinutes ?? 20}
    />
  );
}
