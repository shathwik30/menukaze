'use client';

import { useEffect } from 'react';

export default function KioskError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO(phase-4): replace with @menukaze/monitoring captureException.
    console.error('[kiosk] unhandled error', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <div className="max-w-lg">
        <h1 className="text-4xl font-bold">Something went wrong</h1>
        <p className="text-muted-foreground mt-4 text-lg">
          Please try again, or ask a staff member for help.
        </p>
        <button
          type="button"
          onClick={reset}
          className="bg-primary text-primary-foreground mt-8 rounded-lg px-8 py-4 text-lg font-medium"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
