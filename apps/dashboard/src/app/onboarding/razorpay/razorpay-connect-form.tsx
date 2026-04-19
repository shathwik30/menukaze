'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FieldError, FieldHint, Input, Label } from '@menukaze/ui';
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
      router.push('/onboarding/go-live');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <label className="block space-y-1.5">
        <Label>Key ID</Label>
        <Input
          type="text"
          required
          placeholder="rzp_test_XXXXXXXXXXXX"
          value={keyId}
          onChange={(event) => setKeyId(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
        <FieldHint>
          Test-mode key IDs start with <span className="font-mono">rzp_test_</span>.
        </FieldHint>
      </label>

      <label className="block space-y-1.5">
        <Label>Key Secret</Label>
        <Input
          type="password"
          required
          value={keySecret}
          onChange={(event) => setKeySecret(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
        <FieldHint>
          Stored AES-256-GCM envelope-encrypted. Never shown again in plaintext.
        </FieldHint>
      </label>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button type="submit" disabled={pending} full loading={pending}>
        Connect Razorpay and continue
      </Button>
    </form>
  );
}
