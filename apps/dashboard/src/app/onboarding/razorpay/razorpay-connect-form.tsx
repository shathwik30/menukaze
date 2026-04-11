'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { connectRazorpayAction } from '@/app/actions/razorpay';

export function RazorpayConnectForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await connectRazorpayAction({
        keyId: keyId.trim(),
        keySecret: keySecret.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/admin');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Key ID</span>
        <input
          type="text"
          required
          placeholder="rzp_test_XXXXXXXXXXXX"
          value={keyId}
          onChange={(event) => setKeyId(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2"
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Test-mode key IDs start with <span className="font-mono">rzp_test_</span>.
        </p>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Key Secret</span>
        <input
          type="password"
          required
          value={keySecret}
          onChange={(event) => setKeySecret(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2"
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Stored AES-256-GCM envelope-encrypted. Never shown again in plaintext.
        </p>
      </label>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? 'Verifying with Razorpay…' : 'Connect Razorpay and continue'}
      </button>
    </form>
  );
}
