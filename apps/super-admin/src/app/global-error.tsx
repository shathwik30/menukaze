'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO(phase-4): replace with @menukaze/monitoring captureException.
    console.error('[super-admin] global error', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Console unavailable</h1>
          <p style={{ marginTop: 8, color: '#666' }}>
            A fatal error prevented the admin console from rendering.
          </p>
          {error.digest ? (
            <p style={{ marginTop: 16, fontFamily: 'monospace', fontSize: 12, color: '#888' }}>
              Ref: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: '8px 16px',
              border: '1px solid #333',
              borderRadius: 6,
              background: '#111',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
