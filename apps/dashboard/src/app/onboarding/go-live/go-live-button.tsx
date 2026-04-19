'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, FieldError } from '@menukaze/ui';
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
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold">Go live</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {hasRazorpay
            ? 'Your storefront will accept real orders immediately through Razorpay test mode.'
            : 'Your storefront will be visible, but checkout will show "Coming Soon" until you connect Razorpay.'}
        </p>
        {!canActivate ? (
          <FieldError className="mt-2">
            Add at least one menu item before going live. You currently have {itemCount}.
          </FieldError>
        ) : null}

        {error ? <FieldError className="mt-3">{error}</FieldError> : null}

        <Button
          type="button"
          onClick={onClick}
          disabled={pending || !canActivate}
          loading={pending}
          className="mt-4"
        >
          Go live
        </Button>
      </CardContent>
    </Card>
  );
}
