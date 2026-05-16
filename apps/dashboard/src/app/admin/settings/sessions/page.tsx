import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { listMySessionsAction } from '@/app/actions/sessions';
import { SessionsManager } from './sessions-manager';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  await requireSession();
  const result = await listMySessionsAction();

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
            Account
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
            Devices &amp; sessions
          </h1>
          <p
            style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)', maxWidth: 500 }}
          >
            Each browser or device that&apos;s signed in appears below. Revoke anything you
            don&apos;t recognise.
          </p>
        </div>
        <Link
          href="/admin/settings"
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
      <div style={{ padding: '24px 40px 48px', maxWidth: 680 }}>
        {result.ok ? (
          <SessionsManager initialSessions={result.data.sessions} />
        ) : (
          <div
            style={{
              padding: '20px 24px',
              borderRadius: 14,
              border: '1px solid var(--mk-ink-100)',
              background: 'white',
            }}
          >
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: 'var(--mk-ink-800)' }}>
              Couldn&apos;t load sessions
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)' }}>
              {result.error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
