'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useKioskCart } from '@/stores/cart';

/**
 * Resets the kiosk to the attract screen after `timeoutMs` ms of inactivity.
 * Call this hook in every interactive kiosk page.
 */
export function useIdleReset(timeoutMs = 90_000) {
  const router = useRouter();
  const clear = useKioskCart((s) => s.clear);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        clear();
        router.push('/kiosk');
      }, timeoutMs);
    }

    const events = ['touchstart', 'touchend', 'mousemove', 'keydown', 'click'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset(); // Start timer immediately

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [clear, router, timeoutMs]);
}
