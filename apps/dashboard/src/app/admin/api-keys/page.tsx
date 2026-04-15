import { getMongoConnection, getModels } from '@menukaze/db';
import { Eyebrow } from '@menukaze/ui';
import { requirePageFlag } from '@/lib/session';
import { ApiKeysManager } from './api-keys-manager';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  const { restaurantId } = await requirePageFlag(['api_keys.manage']);
  const conn = await getMongoConnection('live');
  const { ApiKey } = getModels(conn);
  const keys = await ApiKey.find({ restaurantId }).sort({ createdAt: -1 }).lean().exec();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
      <header>
        <Eyebrow withBar tone="accent">
          Developers
        </Eyebrow>
        <h1 className="text-foreground mt-3 font-serif text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
          API keys
        </h1>
        <p className="text-ink-500 dark:text-ink-400 mt-2 max-w-2xl text-sm">
          Each API key is also a channel — orders placed through a key are tagged with that
          key&apos;s name across the dashboard, KDS, and analytics.
        </p>
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
    </div>
  );
}
