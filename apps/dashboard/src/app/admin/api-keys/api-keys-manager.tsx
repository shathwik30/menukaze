'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createApiKeyAction, revokeApiKeyAction, type CreatedApiKey } from '@/app/actions/api-keys';

interface KeyRow {
  id: string;
  name: string;
  scope: 'read_only' | 'read_write' | 'admin';
  env: 'live' | 'test';
  prefix: string;
  lastFour: string;
  icon: string | null;
  color: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  requestCount: number;
}

export function ApiKeysManager({ keys }: { keys: KeyRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<KeyRow['scope']>('read_only');
  const [env, setEnv] = useState<KeyRow['env']>('test');
  const [color, setColor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [pending, start] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const onCreate = (): void => {
    setError(null);
    setCreated(null);
    start(async () => {
      const result = await createApiKeyAction({
        name,
        scope,
        env,
        ...(color.trim() ? { color: color.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result.data);
      setName('');
      setColor('');
      router.refresh();
    });
  };

  const onRevoke = (id: string): void => {
    setError(null);
    setRevokingId(id);
    start(async () => {
      const result = await revokeApiKeyAction(id);
      if (!result.ok) setError(result.error);
      setRevokingId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <section className="border-border space-y-3 rounded-md border p-4">
        <h2 className="text-base font-semibold">Create key</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_140px_140px]">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Channel name (e.g. Our WordPress site)"
            className="border-border h-9 rounded-md border px-3 text-sm"
          />
          <select
            value={env}
            onChange={(e) => setEnv(e.target.value as KeyRow['env'])}
            className="border-border h-9 rounded-md border px-2 text-sm"
          >
            <option value="test">test</option>
            <option value="live">live</option>
          </select>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as KeyRow['scope'])}
            className="border-border h-9 rounded-md border px-2 text-sm"
          >
            <option value="read_only">read-only</option>
            <option value="read_write">read-write</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="badge colour (optional, e.g. emerald)"
            className="border-border h-9 flex-1 rounded-md border px-3 text-sm"
          />
          <button
            type="button"
            onClick={onCreate}
            disabled={pending || !name.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium disabled:opacity-50"
          >
            Generate key
          </button>
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {created ? (
        <section className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="font-semibold text-emerald-900 dark:text-emerald-100">
            Copy this key now — it will not be shown again.
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-emerald-900 px-3 py-2 font-mono text-xs text-emerald-50">
            {created.raw}
          </pre>
          <p className="text-muted-foreground mt-2 text-xs">
            Channel: {created.name} · ends in {created.lastFour}
          </p>
        </section>
      ) : null}

      {keys.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No keys yet. Create one above to start tagging API-driven orders to a channel.
        </p>
      ) : (
        <ul className="border-border divide-border divide-y rounded-md border">
          {keys.map((k) => {
            const revoked = Boolean(k.revokedAt);
            const isRevoking = pending && revokingId === k.id;
            return (
              <li key={k.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {k.name}
                    <span className="text-muted-foreground ml-2 text-xs uppercase">
                      {k.env} · {k.scope.replace('_', '-')}
                    </span>
                  </p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {k.prefix}…{k.lastFour}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {k.requestCount} request{k.requestCount === 1 ? '' : 's'}
                    {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : ''}
                    {revoked ? ` · revoked ${new Date(k.revokedAt!).toLocaleString()}` : ''}
                  </p>
                </div>
                {!revoked ? (
                  <button
                    type="button"
                    onClick={() => onRevoke(k.id)}
                    disabled={isRevoking}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    {isRevoking ? 'Revoking…' : 'Revoke'}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
