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
    console.error('[qr-dinein] global error', error);
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
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>We&apos;re having trouble</h1>
          <p style={{ marginTop: 8, color: '#666' }}>Please reload, or ask your server for help.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: '10px 18px',
              border: 'none',
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
