import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { TablesSetupForm } from './tables-setup-form';

export const dynamic = 'force-dynamic';

export default async function OnboardingTablesPage() {
  const { restaurantId } = await requirePageFlag(['tables.edit']);

  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) redirect('/onboarding');

  if (restaurant.onboardingStep !== 'tables') {
    redirect('/admin');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">Step 3 of 6</p>
        <h1 className="mt-1 text-3xl font-bold">Tables &amp; QR codes</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          If you have dine-in seating, enter how many tables you run. We&apos;ll auto-create them
          and generate a unique QR code for each one. You can rename, adjust capacity, and assign
          zones later from the Table Management dashboard.
        </p>
      </header>

      <TablesSetupForm />

      <footer className="text-muted-foreground text-xs">
        Operating <span className="text-foreground font-mono">{restaurant.slug}</span>
      </footer>
    </main>
  );
}
