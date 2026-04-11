'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startOrJoinSessionAction } from '@/app/actions/session';

export function StartSessionForm({ qrToken }: { qrToken: string }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await startOrJoinSessionAction(qrToken, {
            name,
            email,
            phone,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/session/${result.sessionId}`);
        });
      }}
      className="border-border flex flex-col gap-3 rounded-lg border p-5"
    >
      <p className="text-foreground text-sm">
        Start your dine-in order. We&apos;ll email you a receipt at the end.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span>Name</span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          autoComplete="name"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          autoComplete="email"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Phone</span>
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 123 4567"
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          autoComplete="tel"
        />
        <span className="text-muted-foreground text-xs">
          Stored for future SMS updates — we won&apos;t text you yet.
        </span>
      </label>

      {error ? (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="bg-primary text-primary-foreground mt-2 h-11 rounded-md text-sm font-semibold disabled:opacity-50"
      >
        {isPending ? 'Starting…' : 'Start ordering'}
      </button>
    </form>
  );
}
