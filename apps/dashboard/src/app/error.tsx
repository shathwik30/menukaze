'use client';

import { captureException } from '@menukaze/monitoring';
import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { surface: 'dashboard:error' });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="bg-card max-w-md rounded-xl border p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          An unexpected error occurred. You can retry, or reload the page. If it keeps happening,
          contact Menukaze support.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground mt-4 font-mono text-xs">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
          <a href="/admin" className="border-input rounded-md border px-4 py-2 text-sm font-medium">
            Back to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
