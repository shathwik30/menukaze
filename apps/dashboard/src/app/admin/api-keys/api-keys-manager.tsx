'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  FieldError,
  Input,
  Label,
  Select,
  cn,
} from '@menukaze/ui';
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

const SCOPE_TONE = {
  read_only: 'subtle',
  read_write: 'info',
  admin: 'danger',
} as const;

const ENV_TONE = {
  test: 'warning',
  live: 'success',
} as const;

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
  const [copied, setCopied] = useState(false);

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

  const copyKey = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card variant="surface" radius="lg">
        <CardHeader>
          <CardTitle>Create key</CardTitle>
          <CardDescription>
            Keys are hashed at rest. The raw secret is shown once — save it somewhere safe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px_160px]">
            <div className="space-y-1.5">
              <Label htmlFor="key-name" required>
                Channel name
              </Label>
              <Input
                id="key-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. WordPress site"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key-env">Environment</Label>
              <Select
                id="key-env"
                value={env}
                onChange={(e) => setEnv(e.target.value as KeyRow['env'])}
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key-scope">Scope</Label>
              <Select
                id="key-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as KeyRow['scope'])}
              >
                <option value="read_only">Read-only</option>
                <option value="read_write">Read-write</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="key-color">
                Badge colour <span className="text-ink-400">(optional)</span>
              </Label>
              <Input
                id="key-color"
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="e.g. saffron, jade, lapis"
              />
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={onCreate}
              disabled={pending || !name.trim()}
              loading={pending}
            >
              Generate key
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <FieldError>{error}</FieldError> : null}

      {created ? (
        <Card
          variant="surface"
          radius="lg"
          className="border-jade-300 bg-jade-50/60 dark:border-jade-500/30 dark:bg-jade-500/10"
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge variant="success" size="sm" shape="pill" dot>
                  Key created
                </Badge>
                <CardTitle className="mt-3 font-serif text-2xl">Copy this key now</CardTitle>
                <CardDescription>
                  The raw secret will not be shown again.{' '}
                  <span className="text-jade-800 dark:text-jade-300 font-medium">
                    {created.name}
                  </span>{' '}
                  · ends in {created.lastFour}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border-ink-950 bg-ink-950 group relative overflow-hidden rounded-xl border shadow-inner">
              <pre className="text-saffron-300 overflow-x-auto px-4 py-4 font-mono text-sm">
                {created.raw}
              </pre>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={copyKey}
                className="absolute top-3 right-3"
              >
                {copied ? (
                  <>
                    <CheckIcon /> Copied
                  </>
                ) : (
                  <>
                    <CopyIcon /> Copy
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card variant="surface" radius="lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Active &amp; past keys</CardTitle>
            <Badge variant="subtle" size="sm" shape="pill">
              {keys.length} key{keys.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <EmptyState
              compact
              title="No API keys yet"
              description="Generate a key above to start tagging API-driven orders to a channel."
              icon={<KeyIcon />}
            />
          ) : (
            <ul className="divide-ink-100 dark:divide-ink-800 divide-y">
              {keys.map((k) => {
                const revoked = Boolean(k.revokedAt);
                const isRevoking = pending && revokingId === k.id;
                return (
                  <li
                    key={k.id}
                    className={cn(
                      'flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between',
                      revoked && 'opacity-60',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="bg-canvas-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300 flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <KeyIcon />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-foreground font-serif text-base font-medium">
                            {k.name}
                          </p>
                          <Badge variant={ENV_TONE[k.env]} size="xs" shape="pill">
                            {k.env}
                          </Badge>
                          <Badge variant={SCOPE_TONE[k.scope]} size="xs" shape="pill">
                            {k.scope.replace('_', '-')}
                          </Badge>
                          {revoked ? (
                            <Badge variant="outline" size="xs" shape="pill">
                              Revoked
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-ink-500 dark:text-ink-400 mt-1 font-mono text-xs">
                          <span className="text-ink-700 dark:text-ink-300">{k.prefix}</span>
                          <span className="text-ink-400">•••</span>
                          {k.lastFour}
                        </p>
                        <p className="text-ink-400 dark:text-ink-500 mt-1 text-[11px]">
                          <span className="mk-nums tabular-nums">{k.requestCount}</span> request
                          {k.requestCount === 1 ? '' : 's'}
                          {k.lastUsedAt
                            ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}`
                            : ''}
                          {revoked ? ` · revoked ${new Date(k.revokedAt!).toLocaleString()}` : ''}
                        </p>
                      </div>
                    </div>
                    {!revoked ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRevoke(k.id)}
                        disabled={isRevoking}
                        loading={isRevoking}
                        className="text-mkrose-600 hover:text-mkrose-700"
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KeyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <circle cx="7" cy="15" r="4" />
      <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3M9.6 11.4l2.3-2.3" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden
    >
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
