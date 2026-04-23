import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, Eyebrow } from '@menukaze/ui';
import { requireSession } from '@/lib/session';
import { listMySessionsAction } from '@/app/actions/sessions';
import { SessionsManager } from './sessions-manager';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  await requireSession();
  const result = await listMySessionsAction();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow withBar tone="accent">
            Account
          </Eyebrow>
          <h1 className="text-foreground mt-3 font-serif text-3xl font-medium tracking-tight">
            Devices & sessions
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-2 text-sm">
            Each browser or device that&apos;s signed in appears below. Revoke anything you
            don&apos;t recognise.
          </p>
        </div>
        <Link href="/admin" className="text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      {result.ok ? (
        <SessionsManager initialSessions={result.data.sessions} />
      ) : (
        <Card variant="surface" radius="lg">
          <CardHeader>
            <CardTitle>Couldn&apos;t load sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-ink-500 text-sm">{result.error}</p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
