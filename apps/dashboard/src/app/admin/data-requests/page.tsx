import Link from 'next/link';
import { requireAnyPageFlag } from '@/lib/session';
import { DataRequestsClient } from './data-requests-client';

export const dynamic = 'force-dynamic';

export default async function DataRequestsPage() {
  const { permissions } = await requireAnyPageFlag(['customers.export', 'customers.delete']);

  return (
    <div>
      <div
        style={{
          padding: '28px 40px 24px',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--mk-saffron-700)',
              marginBottom: 8,
            }}
          >
            Customers
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: 'var(--mk-ink-950)',
            }}
          >
            Data requests
          </h1>
          <p
            style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)', maxWidth: 560 }}
          >
            DPDPA and GDPR workflows for exporting or anonymising a verified customer&apos;s data.
          </p>
        </div>
        <Link
          href="/admin"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--mk-ink-500)',
            textDecoration: 'none',
          }}
        >
          ← Back
        </Link>
      </div>
      <div style={{ padding: '24px 40px 48px' }}>
        <DataRequestsClient
          canExport={permissions.includes('customers.export')}
          canDelete={permissions.includes('customers.delete')}
        />
      </div>
    </div>
  );
}
