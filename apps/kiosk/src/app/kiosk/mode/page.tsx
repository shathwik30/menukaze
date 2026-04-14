'use client';

import { useRouter } from 'next/navigation';
import { useKioskCart } from '@/stores/cart';
import { useIdleReset } from '@/hooks/use-idle-reset';

export default function ModeSelectPage() {
  const router = useRouter();
  const setOrderMode = useKioskCart((s) => s.setOrderMode);
  useIdleReset();

  function choose(mode: 'dine_in' | 'takeaway') {
    setOrderMode(mode);
    router.push('/kiosk/menu');
  }

  return (
    <main className="flex h-screen flex-col bg-zinc-50 text-zinc-950">
      <header className="flex h-24 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-8">
        <button
          type="button"
          onClick={() => router.push('/kiosk')}
          className="h-14 rounded-lg border border-zinc-300 px-5 text-lg font-bold text-zinc-700 active:bg-zinc-100"
        >
          Back
        </button>
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-emerald-700">
            Step 1 of 3
          </p>
          <h1 className="mt-1 text-3xl font-black">How are you dining today?</h1>
        </div>
        <div className="w-24" />
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-2 gap-6 p-8">
        <button
          type="button"
          onClick={() => choose('dine_in')}
          className="group flex min-h-0 flex-col justify-between rounded-lg border-2 border-zinc-200 bg-white p-8 text-left shadow-sm active:scale-[0.995] active:border-emerald-500"
        >
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-lg bg-emerald-100 text-3xl font-black text-emerald-800">
            IN
          </span>
          <span>
            <span className="block text-6xl font-black tracking-tight">Dine in</span>
            <span className="mt-4 block max-w-md text-2xl leading-snug text-zinc-600">
              Eat here and listen for your pickup number.
            </span>
          </span>
          <span className="inline-flex h-16 items-center justify-center rounded-lg bg-zinc-950 px-8 text-2xl font-black text-white group-active:bg-emerald-600">
            Choose dine in
          </span>
        </button>

        <button
          type="button"
          onClick={() => choose('takeaway')}
          className="group flex min-h-0 flex-col justify-between rounded-lg border-2 border-zinc-200 bg-white p-8 text-left shadow-sm active:scale-[0.995] active:border-rose-500"
        >
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-lg bg-rose-100 text-3xl font-black text-rose-800">
            GO
          </span>
          <span>
            <span className="block text-6xl font-black tracking-tight">Takeaway</span>
            <span className="mt-4 block max-w-md text-2xl leading-snug text-zinc-600">
              Pick up your order when your number is called.
            </span>
          </span>
          <span className="inline-flex h-16 items-center justify-center rounded-lg bg-zinc-950 px-8 text-2xl font-black text-white group-active:bg-rose-600">
            Choose takeaway
          </span>
        </button>
      </section>
    </main>
  );
}
