'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useKioskCart } from '@/stores/cart';

// `enabled` lets payment flows pause the reset while an external modal owns focus.
export function useIdleReset(timeoutMs = 90_000, enabled = true) {
  const router = useRouter();
  const clear = useKioskCart((s) => s.clear);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs keep values current without re-running the effect or capturing stale state.
  const routerRef = useRef(router);
  const clearRef = useRef(clear);
  const timeoutRef = useRef(timeoutMs);
  routerRef.current = router;
  clearRef.current = clear;
  timeoutRef.current = timeoutMs;

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }

    function handleActivity() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        clearRef.current();
        routerRef.current.push('/kiosk');
      }, timeoutRef.current);
    }

    const events = ['touchstart', 'touchend', 'mousemove', 'keydown', 'click'] as const;
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    handleActivity();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled]);
}
