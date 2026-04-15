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
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit log</h1>
          <p className="text-muted-foreground text-sm">
            {entries.length} most recent entr{entries.length === 1 ? 'y' : 'ies'}.
            {scope === 'me' ? ' Showing only your actions.' : ' Showing every action.'}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {canViewAll ? (
            <>
              <Link
                href="/admin/audit"
                className={`border-border rounded-md border px-3 py-1 ${
                  scope === 'all' ? 'bg-foreground text-background' : 'hover:bg-muted'
                }`}
              >
                Everyone
              </Link>
              <Link
                href="/admin/audit?scope=me"
                className={`border-border rounded-md border px-3 py-1 ${
                  scope === 'me' ? 'bg-foreground text-background' : 'hover:bg-muted'
                }`}
              >
                Just me
              </Link>
            </>
          ) : null}
          <Link href="/admin" className="text-foreground underline underline-offset-4">
            ← Back
          </Link>
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No actions recorded yet.</p>
      ) : (
        <table className="border-border w-full border text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Who</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Resource</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const user = entry.userId ? userById.get(String(entry.userId)) : null;
              return (
                <tr key={String(entry._id)} className="border-border border-t">
                  <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                    {new Date(entry.at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {user ? (
                      <>
                        <span className="font-medium">{user.name || user.email}</span>
                        <span className="text-muted-foreground ml-2">{entry.role}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{entry.userEmail ?? 'system'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{entry.action}</td>
                  <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                    {entry.resourceType ? `${entry.resourceType} ${entry.resourceId ?? ''}` : '—'}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                    {entry.ip ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {canViewAll ? (
        <p className="text-muted-foreground text-xs">
          Each row is hash-chained to the previous: tampering with history is detectable.
        </p>
      ) : null}
    </main>
  );
}
