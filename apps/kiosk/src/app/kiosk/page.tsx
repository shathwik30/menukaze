import Link from 'next/link';
import { headers } from 'next/headers';
import { getMongoConnection, getModels } from '@menukaze/db';
import { resolveTenantOrNotFound } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function AttractScreen() {
  const restaurant = await resolveTenantOrNotFound();

  const h = await headers();
  const nonce = h.get('x-nonce') ?? undefined;

  const logoUrl = restaurant.logoUrl;

  // Suppress noise: fetch active item count to show "N items available"
  let itemCount = 0;
  try {
    const conn = await getMongoConnection('live');
    const { Item } = getModels(conn);
    itemCount = await Item.countDocuments({ restaurantId: restaurant._id, soldOut: false });
  } catch {
    // Non-fatal
  }

  return (
    <main className="relative flex h-screen overflow-hidden bg-zinc-950 text-white">
      <script
        nonce={nonce}
        type="application/json"
        id="kiosk-meta"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ restaurant: restaurant.name }),
        }}
      />

      <div className="absolute inset-y-0 left-0 w-3 bg-emerald-400" />
      <div className="grid min-h-0 w-full grid-cols-[1.05fr_0.95fr]">
        <section className="flex min-h-0 flex-col justify-between px-14 py-12">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={restaurant.name}
                className="h-20 w-20 rounded-lg border border-white/15 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-3xl font-black">
                {restaurant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-300">
                Self ordering
              </p>
              <p className="mt-1 text-3xl font-black tracking-tight">{restaurant.name}</p>
            </div>
          </div>

          <div className="max-w-3xl">
            <p className="text-2xl font-semibold text-white/70">Welcome to {restaurant.name}</p>
            <h1 className="mt-4 max-w-2xl text-7xl font-black leading-none tracking-tight">
              Tap to order
            </h1>
            <p className="mt-6 max-w-xl text-2xl leading-snug text-white/70">
              Choose your items, pay here, and keep your pickup number for collection.
            </p>
          </div>

          <div className="grid max-w-2xl grid-cols-3 gap-3 text-sm font-semibold text-white/70">
            <div className="rounded-lg border border-white/15 bg-white/5 p-4">
              <p className="text-white">1. Choose</p>
              <p className="mt-1 font-normal text-white/50">Browse the live menu.</p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/5 p-4">
              <p className="text-white">2. Pay</p>
              <p className="mt-1 font-normal text-white/50">Use the secure checkout.</p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/5 p-4">
              <p className="text-white">3. Collect</p>
              <p className="mt-1 font-normal text-white/50">Listen for your number.</p>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col justify-center bg-white px-12 text-zinc-950">
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-zinc-500">
                  Available now
                </p>
                {itemCount > 0 ? (
                  <p className="rounded-md bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
                    {itemCount} items
                  </p>
                ) : null}
              </div>
              <p className="mt-4 text-4xl font-black leading-tight">Start when you are ready.</p>
              <p className="mt-3 text-lg leading-relaxed text-zinc-600">
                Your pickup number appears right after payment.
              </p>
            </div>

            <Link
              href="/kiosk/mode"
              className="mt-5 flex h-24 w-full items-center justify-center rounded-lg bg-emerald-500 text-3xl font-black text-zinc-950 shadow-xl shadow-emerald-950/20 active:translate-y-0.5 active:bg-emerald-400"
            >
              Start order
            </Link>

            <p className="mt-5 text-center text-base font-medium text-zinc-500">
              Touch the button above to begin.
            </p>
          </div>
        </section>
      </div>

      <div className="pointer-events-none absolute bottom-0 right-0 h-32 w-32 border-b-[32px] border-r-[32px] border-b-rose-500 border-r-rose-500" />
    </main>
  );
}
