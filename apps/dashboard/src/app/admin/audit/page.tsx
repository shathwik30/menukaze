import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireAnyPageFlag } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ scope?: string }>;
}

export default async function AuditLogPage({ searchParams }: PageProps) {
  const { restaurantId, session, permissions } = await requireAnyPageFlag([
    'audit.view_self',
    'audit.view_all',
  ]);
  const params = await searchParams;
  const canViewAll = permissions.includes('audit.view_all');
  const scope = params.scope === 'me' || !canViewAll ? 'me' : 'all';

  const conn = await getMongoConnection('live');
  const { AuditLog, User } = getModels(conn);

  const filter: Record<string, unknown> = { restaurantId };
  if (scope === 'me') {
    filter['userId'] = session.user.id;
  }
  const entries = await AuditLog.find(filter).sort({ at: -1 }).limit(200).lean().exec();

  const userIds = Array.from(
    new Set(
      entries
        .map((e) => (e.userId ? String(e.userId) : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const users =
    userIds.length > 0
      ? await User.find({ _id: { $in: userIds } }, { name: 1, email: 1 })
          .lean()
          .exec()
      : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

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
          flexWrap: 'wrap',
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
            Security
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
            Audit log
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)' }}>
            {entries.length} most recent entr{entries.length === 1 ? 'y' : 'ies'}.
            {scope === 'me' ? ' Showing only your actions.' : ' Showing every action.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canViewAll ? (
            <div
              style={{
                display: 'inline-flex',
                gap: 2,
                padding: 2,
                background: 'var(--mk-canvas-100)',
                borderRadius: 8,
              }}
            >
              <Link
                href="/admin/audit"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 28,
                  padding: '0 12px',
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontWeight: 500,
                  textDecoration: 'none',
                  background: scope === 'all' ? 'white' : 'transparent',
                  color: scope === 'all' ? 'var(--mk-ink-950)' : 'var(--mk-ink-500)',
                  boxShadow: scope === 'all' ? 'var(--shadow-xs)' : 'none',
                }}
              >
                Everyone
              </Link>
              <Link
                href="/admin/audit?scope=me"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 28,
                  padding: '0 12px',
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontWeight: 500,
                  textDecoration: 'none',
                  background: scope === 'me' ? 'white' : 'transparent',
                  color: scope === 'me' ? 'var(--mk-ink-950)' : 'var(--mk-ink-500)',
                  boxShadow: scope === 'me' ? 'var(--shadow-xs)' : 'none',
                }}
              >
                Just me
              </Link>
            </div>
          ) : null}
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
      </div>

      <div style={{ padding: '24px 40px 48px' }}>
        {entries.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--mk-ink-500)' }}>No actions recorded yet.</p>
        ) : (
          <div
            style={{
              background: 'white',
              border: '1px solid var(--mk-ink-100)',
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr
                  style={{
                    background: 'var(--mk-canvas-50)',
                    borderBottom: '1px solid var(--mk-ink-100)',
                  }}
                >
                  {['When', 'Who', 'Action', 'Resource', 'IP'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--mk-ink-500)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const user = entry.userId ? userById.get(String(entry.userId)) : null;
                  return (
                    <tr
                      key={String(entry._id)}
                      style={{ borderBottom: '1px solid var(--mk-ink-100)' }}
                    >
                      <td
                        style={{
                          padding: '10px 16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11.5,
                          color: 'var(--mk-ink-400)',
                        }}
                      >
                        {new Date(entry.at).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12.5 }}>
                        {user ? (
                          <span style={{ fontWeight: 500, color: 'var(--mk-ink-900)' }}>
                            {user.name || user.email}{' '}
                            <span style={{ color: 'var(--mk-ink-400)', fontWeight: 400 }}>
                              {entry.role}
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--mk-ink-400)' }}>
                            {entry.userEmail ?? 'system'}
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '10px 16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11.5,
                          color: 'var(--mk-ink-700)',
                        }}
                      >
                        {entry.action}
                      </td>
                      <td
                        style={{
                          padding: '10px 16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11.5,
                          color: 'var(--mk-ink-400)',
                        }}
                      >
                        {entry.resourceType
                          ? `${entry.resourceType} ${entry.resourceId ?? ''}`
                          : '—'}
                      </td>
                      <td
                        style={{
                          padding: '10px 16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11.5,
                          color: 'var(--mk-ink-400)',
                        }}
                      >
                        {entry.ip ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {canViewAll ? (
          <p style={{ marginTop: 12, fontSize: 11.5, color: 'var(--mk-ink-400)' }}>
            Each row is hash-chained to the previous: tampering with history is detectable.
          </p>
        ) : null}
      </div>
    </div>
  );
}
