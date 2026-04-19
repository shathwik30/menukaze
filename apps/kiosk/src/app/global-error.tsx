'use client';

import { captureException } from '@menukaze/monitoring';
import { Button } from '@menukaze/ui';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { surface: 'kiosk:global-error' });
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
          padding: '32px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 520 }}>
          <h1 style={{ fontSize: 32, margin: 0 }}>Kiosk unavailable</h1>
          <p style={{ marginTop: 12, color: '#666', fontSize: 18 }}>
            Please ask a staff member to restart this device.
          </p>
          <Button
            variant="plain"
            size="none"
            type="button"
            onClick={reset}
            style={{
              marginTop: 32,
              padding: '14px 28px',
              border: 'none',
              borderRadius: 8,
              background: '#111',
              color: '#fff',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
