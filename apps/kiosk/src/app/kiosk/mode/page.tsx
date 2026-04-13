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
    <main className="flex h-screen flex-col items-center justify-center gap-8 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <h1 className="text-4xl font-extrabold tracking-tight">How are you dining today?</h1>

      <div className="grid grid-cols-2 gap-6">
        <button
          type="button"
          onClick={() => choose('dine_in')}
          className="flex h-48 w-56 flex-col items-center justify-center gap-4 rounded-3xl bg-white/10 text-white shadow-xl transition-transform hover:bg-white/20 active:scale-95"
        >
          <span className="text-6xl">🍽️</span>
          <span className="text-2xl font-bold">Dine In</span>
        </button>

        <button
          type="button"
          onClick={() => choose('takeaway')}
          className="flex h-48 w-56 flex-col items-center justify-center gap-4 rounded-3xl bg-white/10 text-white shadow-xl transition-transform hover:bg-white/20 active:scale-95"
        >
          <span className="text-6xl">🥡</span>
          <span className="text-2xl font-bold">Takeaway</span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => router.push('/kiosk')}
        className="mt-4 text-sm text-white/40 underline"
      >
        ← Back
      </button>
    </main>
  );
}
