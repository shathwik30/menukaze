import { getMongoConnection, getModels } from '@menukaze/db';
import { Eyebrow } from '@menukaze/ui';
import { requirePageFlag } from '@/lib/session';
import { WebhooksManager } from './webhooks-manager';

export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
  const { restaurantId } = await requirePageFlag(['webhooks.manage']);
  const conn = await getMongoConnection('live');
  const { WebhookSubscription, WebhookDelivery } = getModels(conn);

  const subscriptions = await WebhookSubscription.find({ restaurantId })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  const deliveries = await WebhookDelivery.find({ restaurantId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
    .exec();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
      <header>
        <Eyebrow withBar tone="accent">
          Developers
        </Eyebrow>
        <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight font-medium tracking-tight sm:text-5xl">
          Webhooks
        </h1>
        <p className="text-ink-500 dark:text-ink-400 mt-2 max-w-2xl text-sm">
          HTTPS endpoints that receive event notifications. Each delivery is signed with HMAC
          SHA-256 in the{' '}
          <code className="bg-canvas-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300 rounded px-1.5 py-0.5 font-mono text-[12px]">
            X-Menukaze-Signature
          </code>{' '}
          header.
        </p>
      </header>

      <WebhooksManager
        subscriptions={subscriptions.map((s) => ({
          id: String(s._id),
          url: s.url,
          events: s.events,
          enabled: s.enabled,
          description: s.description ?? '',
          createdAt: new Date(s.createdAt).toISOString(),
        }))}
        deliveries={deliveries.map((d) => ({
          id: String(d._id),
          subscriptionId: String(d.subscriptionId),
          eventType: d.eventType,
          status: d.status,
          attempts: d.attempts,
          createdAt: new Date(d.createdAt).toISOString(),
          deliveredAt: d.deliveredAt ? new Date(d.deliveredAt).toISOString() : null,
          lastResponseStatus: d.lastResponseStatus ?? null,
          lastError: d.lastError ?? null,
        }))}
      />
    </div>
  );
}
