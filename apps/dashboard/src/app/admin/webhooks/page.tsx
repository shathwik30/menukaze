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
    <div>
      <div
        style={{
          padding: '28px 40px 24px',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
        }}
      >
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
          Developers
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
          Webhooks
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)', maxWidth: 580 }}>
          HTTPS endpoints that receive event notifications. Each delivery is signed with HMAC
          SHA-256 in the{' '}
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              background: 'var(--mk-canvas-100)',
              color: 'var(--mk-ink-700)',
              padding: '1px 6px',
              borderRadius: 4,
            }}
          >
            X-Menukaze-Signature
          </code>{' '}
          header.
        </p>
      </div>
      <div style={{ padding: '24px 40px 48px' }}>
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
    </div>
  );
}
