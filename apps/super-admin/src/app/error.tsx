'use client';

import { captureException } from '@menukaze/monitoring';
import { Button, Card } from '@menukaze/ui';
import { useEffect } from 'react';

export default function SuperAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { surface: 'super-admin:error' });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md p-8 text-center">
        <h1 className="text-2xl font-semibold">An error occurred</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Something prevented this page from rendering. Retry, or reload the console.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground mt-4 font-mono text-xs">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <Button type="button" onClick={reset}>
            Retry
          </Button>
          <a href="/" className="border-input rounded-md border px-4 py-2 text-sm font-medium">
            Home
          </a>
        </div>
      </Card>
    </main>
  );
}
