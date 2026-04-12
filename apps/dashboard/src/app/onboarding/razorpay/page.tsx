import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { RazorpayConnectForm } from './razorpay-connect-form';

export const dynamic = 'force-dynamic';

/**
 * Payment setup page for the onboarding flow.
 */
export default async function OnboardingRazorpayPage() {
  const { restaurantId } = await requirePageFlag(['payments.configure']);

  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) redirect('/onboarding');

  if (restaurant.onboardingStep !== 'razorpay') {
    redirect('/admin');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">Step 4 of 6</p>
        <h1 className="mt-1 text-3xl font-bold">Connect Razorpay</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Paste your Razorpay <span className="text-foreground font-mono">test-mode</span> key ID
          and key secret. They are verified against Razorpay&apos;s API, then stored AES-256-GCM
          envelope-encrypted with your platform key — never in plaintext.
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          You can find these in the{' '}
          <a
            href="https://dashboard.razorpay.com/app/website-app-settings/api-keys/generate"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            Razorpay Dashboard → Settings → API Keys
          </a>
          . Make sure Test Mode is enabled.
        </p>
      </header>

      <RazorpayConnectForm />

      <footer className="text-muted-foreground text-xs">
        Operating <span className="text-foreground font-mono">{restaurant.slug}</span>
      </footer>
    </main>
  );
}
