import Link from 'next/link';
import { headers } from 'next/headers';
import { getMongoConnection, getModels } from '@menukaze/db';
import { BrandRow } from '@menukaze/ui';
import { resolveTenantOrNotFound } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function AttractScreen() {
  const restaurant = await resolveTenantOrNotFound();

  const h = await headers();
  const nonce = h.get('x-nonce') ?? undefined;

  const logoUrl = restaurant.logoUrl;

  let itemCount = 0;
  try {
    const conn = await getMongoConnection('live');
    const { Item } = getModels(conn);
    itemCount = await Item.countDocuments({ restaurantId: restaurant._id, soldOut: false });
  } catch {
    /* non-fatal: attract screen renders without the item count */
  }

  return (
    <main className="kiosk-screen bg-ink-950 text-canvas-50 relative">
      <script
        nonce={nonce}
        type="application/json"
        id="kiosk-meta"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ restaurant: restaurant.name }),
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 10% 20%, oklch(0.755 0.170 55 / 0.35), transparent 60%), radial-gradient(ellipse 50% 60% at 90% 80%, oklch(0.590 0.140 172 / 0.28), transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className="kiosk-attract-layout relative">
        <section className="kiosk-attract-hero flex min-h-0 flex-col justify-between gap-10">
          <div className="flex items-center gap-5">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={restaurant.name}
                className="size-24 rounded-2xl object-cover shadow-2xl ring-1 ring-white/10"
              />
            ) : (
              <div className="text-canvas-50 flex size-24 items-center justify-center rounded-2xl bg-white/5 font-serif text-4xl font-medium ring-1 ring-white/15">
                {restaurant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-saffron-400 inline-flex items-center gap-2 text-[13px] font-semibold tracking-[0.28em] uppercase">
                <span className="bg-saffron-400 inline-block h-px w-8" />
                Self ordering
              </p>
              <p className="text-canvas-50 mt-3 font-serif text-5xl font-medium tracking-tight">
                {restaurant.name}
              </p>
            </div>
          </div>

          <div>
            <p className="text-canvas-50/60 text-2xl font-medium">Welcome to {restaurant.name}</p>
            <h1 className="kiosk-attract-title text-canvas-50 mt-4 font-serif leading-[0.88] font-medium tracking-[-0.04em]">
              Tap to <span className="text-saffron-400 italic">order.</span>
            </h1>
            <p className="kiosk-attract-copy text-canvas-50/70 mt-8 leading-snug">
              Choose your dishes, pay here, and keep your pickup number for collection.
            </p>
          </div>

          <div className="kiosk-step-grid grid grid-cols-3 gap-4">
            <StepCard n={1} label="Choose" detail="Browse the live menu." />
            <StepCard n={2} label="Pay" detail="Secure checkout in seconds." />
            <StepCard n={3} label="Collect" detail="Listen for your number." />
          </div>
        </section>

        <section className="kiosk-attract-action">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full opacity-80 blur-3xl"
            style={{
              background:
                'radial-gradient(closest-side, oklch(0.885 0.100 68 / 0.55), transparent)',
            }}
          />

          <div className="kiosk-start-wrap relative mx-auto w-full">
            <div className="kiosk-start-card border-ink-100 bg-surface rounded-3xl border p-7 shadow-xl">
              <div className="flex items-center justify-between">
                <p className="text-ink-500 inline-flex items-center gap-2 text-[12px] font-semibold tracking-[0.18em] uppercase">
                  <span className="bg-jade-500 relative inline-flex size-2 rounded-full">
                    <span className="bg-jade-500 absolute inset-0 animate-ping rounded-full opacity-60" />
                  </span>
                  Available now
                </p>
                {itemCount > 0 ? (
                  <span className="bg-jade-500/15 text-jade-700 rounded-full px-3 py-1 text-xs font-semibold">
                    {itemCount} items
                  </span>
                ) : null}
              </div>
              <p className="text-ink-950 mt-5 font-serif text-[42px] leading-[1.05] font-medium tracking-tight">
                Start when you&apos;re ready.
              </p>
              <p className="text-ink-500 mt-3 text-base leading-relaxed">
                Your pickup number appears immediately after payment.
              </p>
            </div>

            <Link
              href="/kiosk/mode"
              className="kiosk-start-button ring-ink-950 group mt-6 flex min-h-28 w-full items-center justify-center gap-4 rounded-3xl font-medium shadow-[0_24px_60px_-10px_oklch(0.14_0.016_90/0.55)] ring-1 transition-all duration-200 active:translate-y-1 active:shadow-[0_12px_30px_-8px_oklch(0.14_0.016_90/0.45)]"
            >
              <span className="font-serif tracking-tight">Start order</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-8"
                aria-hidden
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>

            <div className="mt-6 flex items-center justify-center gap-2">
              <span className="text-ink-400 text-[12px] tracking-[0.18em] uppercase">
                Touch to begin
              </span>
            </div>
          </div>

          <div className="kiosk-start-brand absolute bottom-6 left-1/2 -translate-x-1/2">
            <BrandRow size="sm" className="opacity-70" />
          </div>
        </section>
      </div>
    </main>
  );
}

function StepCard({ n, label, detail }: { n: number; label: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="bg-saffron-500/20 text-saffron-300 ring-saffron-400/30 flex size-7 items-center justify-center rounded-full font-mono text-xs font-semibold ring-1">
          {n}
        </span>
        <p className="text-canvas-50 font-serif text-xl font-medium">{label}</p>
      </div>
      <p className="text-canvas-50/55 mt-2 text-sm leading-relaxed">{detail}</p>
    </div>
  );
}
