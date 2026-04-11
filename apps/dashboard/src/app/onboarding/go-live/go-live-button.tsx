'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { goLiveAction } from '@/app/actions/go-live';

interface Props {
  canActivate: boolean;
  hasRazorpay: boolean;
  itemCount: number;
}

export function GoLiveButton({ canActivate, hasRazorpay, itemCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await goLiveAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/admin');
      router.refresh();
    });
  }

  return (
    <section className="border-border rounded-lg border p-6">
      <h2 className="text-lg font-semibold">Go live</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        {hasRazorpay
          ? 'Your storefront will accept real orders immediately through Razorpay test mode.'
          : 'Your storefront will be visible, but checkout will show "Coming Soon" until you connect Razorpay.'}
      </p>
      {!canActivate ? (
        <p className="text-destructive mt-2 text-sm">
          Add at least one menu item before going live. You currently have {itemCount}.
        </p>
      ) : null}

      {error ? <p className="text-destructive mt-3 text-sm">{error}</p> : null}

      <button
        type="button"
        onClick={onClick}
        disabled={pending || !canActivate}
        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 inline-flex h-10 items-center justify-center rounded-md px-6 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? 'Going live…' : 'Go live'}
      </button>
    </section>
  );
}
