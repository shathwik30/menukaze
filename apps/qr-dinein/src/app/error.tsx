'use client';

import { captureException } from '@menukaze/monitoring';
import { Button } from '@menukaze/ui';
import { useEffect } from 'react';

export default function QrDineinError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { surface: 'qr-dinein:error' });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">
        We couldn&apos;t load this page. Try again, or flag your server for help.
      </p>
      <Button type="button" onClick={reset} className="mt-2">
        Try again
      </Button>
    </main>
  );
}
