import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
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
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground text-sm">
            HTTPS endpoints that receive event notifications. Each delivery is signed with HMAC
            SHA-256 in the <code className="font-mono">X-Menukaze-Signature</code> header.
          </p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
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
    </main>
  );
}
