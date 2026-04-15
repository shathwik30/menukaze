'use client';

import { captureException } from '@menukaze/monitoring';
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
      <button
        type="button"
        onClick={reset}
        className="bg-primary text-primary-foreground mt-2 rounded-md px-5 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </main>
  );
}
