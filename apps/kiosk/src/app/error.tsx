'use client';

import { captureException } from '@menukaze/monitoring';
import { Button } from '@menukaze/ui';
import { useEffect } from 'react';

export default function KioskError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { surface: 'kiosk:error' });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <div className="max-w-lg">
        <h1 className="text-4xl font-bold">Something went wrong</h1>
        <p className="text-muted-foreground mt-4 text-lg">
          Please try again, or ask a staff member for help.
        </p>
        <Button type="button" onClick={reset} size="xl" className="mt-8">
          Try again
        </Button>
      </div>
    </main>
  );
}
