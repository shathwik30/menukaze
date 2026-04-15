import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { ApiKeysManager } from './api-keys-manager';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  const { restaurantId } = await requirePageFlag(['api_keys.manage']);
  const conn = await getMongoConnection('live');
  const { ApiKey } = getModels(conn);
  const keys = await ApiKey.find({ restaurantId }).sort({ createdAt: -1 }).lean().exec();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API keys & channels</h1>
          <p className="text-muted-foreground text-sm">
            Each API key is also a channel. Orders placed through a key are tagged with that
            key&apos;s name on the dashboard, KDS, and analytics.
          </p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      <ApiKeysManager
        keys={keys.map((k) => ({
          id: String(k._id),
          name: k.name,
          scope: k.scope,
          env: k.env,
          prefix: k.prefix,
          lastFour: k.lastFour,
          icon: k.icon ?? null,
          color: k.color ?? null,
          createdAt: new Date(k.createdAt).toISOString(),
          lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
          revokedAt: k.revokedAt ? new Date(k.revokedAt).toISOString() : null,
          requestCount: k.requestCount,
        }))}
      />
    </main>
  );
}
