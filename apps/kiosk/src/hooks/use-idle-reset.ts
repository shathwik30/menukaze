'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useKioskCart } from '@/stores/cart';

/**
 * Resets the kiosk to the attract screen after `timeoutMs` ms of inactivity.
 * Uses a stable handler ref so event listeners are only ever added once,
 * preventing accumulation across re-renders.
 */
export function useIdleReset(timeoutMs = 90_000) {
  const router = useRouter();
  const clear = useKioskCart((s) => s.clear);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-current values without triggering effect re-runs
  const routerRef = useRef(router);
  const clearRef = useRef(clear);
  const timeoutRef = useRef(timeoutMs);
  routerRef.current = router;
  clearRef.current = clear;
  timeoutRef.current = timeoutMs;

  useEffect(() => {
    // This stable function is added once and never replaced
    function handleActivity() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        clearRef.current();
        routerRef.current.push('/kiosk');
      }, timeoutRef.current);
    }

    const events = ['touchstart', 'touchend', 'mousemove', 'keydown', 'click'] as const;
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    handleActivity(); // start the initial timer

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []); // empty — runs once, stable reference guaranteed by refs above
}
