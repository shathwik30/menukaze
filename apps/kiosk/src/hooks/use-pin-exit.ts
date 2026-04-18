'use client';

import { useEffect, useRef, useState } from 'react';
import { verifyKioskPinAction } from '@/app/actions/kiosk';

// Tapping the invisible top-right zone 5 times within 3 s opens the PIN overlay.
export function usePinExit() {
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = document.getElementById('kiosk-exit-trigger');
    if (!el) return;

    function handleTap() {
      tapCount.current += 1;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      if (tapCount.current >= 5) {
        tapCount.current = 0;
        setShowPin(true);
        setPin('');
        setError(null);
      } else {
        tapTimer.current = setTimeout(() => {
          tapCount.current = 0;
        }, 3000);
      }
    }

    el.addEventListener('click', handleTap);
    el.addEventListener('touchend', handleTap);
    return () => {
      el.removeEventListener('click', handleTap);
      el.removeEventListener('touchend', handleTap);
    };
  }, []);

  async function submitPin() {
    const result = await verifyKioskPinAction(pin);
    if (result.ok) {
      setShowPin(false);
      window.location.href = '/kiosk/admin-exit';
    } else {
      setError('Incorrect PIN.');
      setPin('');
    }
  }

  function appendDigit(d: string) {
    if (pin.length < 8) setPin((p) => p + d);
  }

  function backspace() {
    setPin((p) => p.slice(0, -1));
  }

  return {
    showPin,
    pin,
    error,
    appendDigit,
    backspace,
    submitPin,
    dismiss: () => setShowPin(false),
  };
}
