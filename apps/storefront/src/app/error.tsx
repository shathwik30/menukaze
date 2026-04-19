'use client';

import { captureException } from '@menukaze/monitoring';
import { Button } from '@menukaze/ui';
import { useEffect } from 'react';

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { surface: 'storefront:error' });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground">
        We couldn&apos;t load this page. Please try again in a moment.
      </p>
      <Button type="button" onClick={reset} className="mt-2">
        Try again
      </Button>
    </main>
  );
}
