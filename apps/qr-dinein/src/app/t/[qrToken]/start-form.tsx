'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, FieldError, FieldHint, Input, Label } from '@menukaze/ui';
import { startOrJoinSessionAction } from '@/app/actions/session';

const HINT_KEY = 'mk_dinein_hint';

function readOrCreateClientHint(): string {
  if (typeof window === 'undefined') return '';
  let value = window.localStorage.getItem(HINT_KEY);
  if (!value) {
    const random =
      window.crypto?.randomUUID?.() ??
      `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    value = random;
    window.localStorage.setItem(HINT_KEY, value);
  }
  return value;
}

function requestCoords(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  if (typeof window === 'undefined' || !window.navigator?.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: { lat: number; lng: number } | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    window.navigator.geolocation.getCurrentPosition(
      (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => done(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
    setTimeout(() => done(null), timeoutMs + 200);
  });
}

export function StartSessionForm({ qrToken }: { qrToken: string }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [clientHint, setClientHint] = useState('');

  useEffect(() => {
    setClientHint(readOrCreateClientHint());
  }, []);

  return (
    <Card className="p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const coords = await requestCoords();
            const trimmedPhone = phone.trim();
            const result = await startOrJoinSessionAction(
              qrToken,
              { name, email, ...(trimmedPhone ? { phone: trimmedPhone } : {}) },
              { ...(coords ? { coords } : {}), clientHint },
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/session/${result.sessionId}`);
          });
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-foreground text-sm">
          Start your dine-in order. We&apos;ll email you a receipt at the end.
        </p>

        <label className="flex flex-col gap-1.5 text-sm">
          <Label>Name</Label>
          <Input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <Label>Email</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <Label>Phone (optional)</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 123 4567"
            autoComplete="tel"
          />
          <FieldHint>Stored for future SMS updates — we won&apos;t text you yet.</FieldHint>
        </label>

        {error ? <FieldError>{error}</FieldError> : null}

        <Button type="submit" disabled={isPending} loading={isPending} className="mt-2">
          Start ordering
        </Button>
      </form>
    </Card>
  );
}
