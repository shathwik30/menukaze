'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@menukaze/ui';
import {
  revokeAllOtherSessionsAction,
  revokeSessionAction,
  setDeviceLabelAction,
  type SessionSummary,
} from '@/app/actions/sessions';

interface Props {
  initialSessions: SessionSummary[];
}

export function SessionsManager({ initialSessions }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const runRevoke = (id: string) => {
    start(async () => {
      setError(null);
      const result = await revokeSessionAction({ sessionId: id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      router.refresh();
    });
  };

  const runRevokeAllOthers = () => {
    start(async () => {
      setError(null);
      const result = await revokeAllOtherSessionsAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSessions((prev) => prev.filter((s) => s.current));
      router.refresh();
    });
  };

  const runSaveLabel = (id: string, label: string) => {
    start(async () => {
      setError(null);
      const result = await setDeviceLabelAction({ sessionId: id, label });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, deviceLabel: label || null } : s)),
      );
    });
  };

  const otherSessions = sessions.filter((s) => !s.current);

  return (
    <div className="flex flex-col gap-4">
      {otherSessions.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink-600 dark:text-ink-400 text-sm">
            {otherSessions.length} other{' '}
            {otherSessions.length === 1 ? 'session is' : 'sessions are'} active.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={runRevokeAllOthers}
            disabled={pending}
            loading={pending}
          >
            Sign out of all other devices
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="bg-mkrose-50 text-mkrose-700 rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}

      {sessions.length === 0 ? (
        <Card variant="surface" radius="lg">
          <CardContent>
            <p className="text-ink-500 text-sm">No active sessions.</p>
          </CardContent>
        </Card>
      ) : (
        sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            onRevoke={() => runRevoke(session.id)}
            onSaveLabel={(label) => runSaveLabel(session.id, label)}
            pending={pending}
          />
        ))
      )}
    </div>
  );
}

function SessionRow({
  session,
  onRevoke,
  onSaveLabel,
  pending,
}: {
  session: SessionSummary;
  onRevoke: () => void;
  onSaveLabel: (label: string) => void;
  pending: boolean;
}) {
  const [label, setLabel] = useState(session.deviceLabel ?? '');
  const ua = parseUserAgent(session.userAgent);

  return (
    <Card variant="surface" radius="lg">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>
              {session.deviceLabel ?? ua.summary}{' '}
              {session.current ? (
                <Badge variant="success" size="xs" shape="pill" className="ml-2 align-middle">
                  This device
                </Badge>
              ) : null}
            </CardTitle>
            <p className="text-ink-500 dark:text-ink-400 mt-1 text-xs">
              {ua.full}
              {ua.full && session.userAgent ? ' · ' : ''}
              {session.userAgent ? (
                <span className="font-mono text-[10px]">{session.userAgent}</span>
              ) : null}
            </p>
          </div>
          {!session.current ? (
            <Button type="button" variant="outline" size="sm" onClick={onRevoke} disabled={pending}>
              Sign out
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <dl className="text-ink-600 dark:text-ink-400 grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
          <div>
            <dt className="text-ink-500 font-semibold tracking-[0.12em] uppercase">IP address</dt>
            <dd className="text-foreground font-mono">{session.ipAddress ?? 'unknown'}</dd>
          </div>
          <div>
            <dt className="text-ink-500 font-semibold tracking-[0.12em] uppercase">
              First signed in
            </dt>
            <dd>{session.createdAt ? new Date(session.createdAt).toLocaleString() : 'unknown'}</dd>
          </div>
          <div>
            <dt className="text-ink-500 font-semibold tracking-[0.12em] uppercase">Last active</dt>
            <dd>
              {session.lastActiveAt ? new Date(session.lastActiveAt).toLocaleString() : 'unknown'}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500 font-semibold tracking-[0.12em] uppercase">Expires</dt>
            <dd>{new Date(session.expiresAt).toLocaleString()}</dd>
          </div>
        </dl>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSaveLabel(label.trim());
          }}
          className="mt-4 flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-1 flex-col gap-1 text-xs">
            Device label
            <Input
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={'e.g. "Front-of-house iPad"'}
              maxLength={80}
            />
          </label>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Save label
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

interface ParsedUa {
  summary: string;
  full: string;
}

function parseUserAgent(userAgent: string | null): ParsedUa {
  if (!userAgent) return { summary: 'Unknown device', full: '' };

  const ua = userAgent.toLowerCase();
  const os = ua.includes('iphone')
    ? 'iPhone'
    : ua.includes('ipad')
      ? 'iPad'
      : ua.includes('android')
        ? 'Android'
        : ua.includes('mac os')
          ? 'macOS'
          : ua.includes('windows')
            ? 'Windows'
            : ua.includes('linux')
              ? 'Linux'
              : 'Unknown OS';
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('firefox')
      ? 'Firefox'
      : ua.includes('chrome')
        ? 'Chrome'
        : ua.includes('safari')
          ? 'Safari'
          : 'Browser';
  return { summary: `${browser} on ${os}`, full: '' };
}
