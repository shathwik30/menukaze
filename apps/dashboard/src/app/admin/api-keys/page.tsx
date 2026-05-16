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
          API keys
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)', maxWidth: 560 }}>
          Programmatic access to Menukaze. Use test keys until you are ready to flip an integration
          live.
        </p>
      </div>
      <div style={{ padding: '24px 40px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section
          style={{
            background: 'var(--mk-ink-950)',
            color: 'var(--mk-canvas-50)',
            border: '1px solid var(--mk-ink-950)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <div
            style={{
              padding: 24,
              display: 'grid',
              gridTemplateColumns: 'minmax(240px, 1fr) minmax(320px, 1fr)',
              gap: 24,
              alignItems: 'center',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--mk-saffron-300)',
                }}
              >
                Quickstart
              </div>
              <h2
                style={{
                  margin: '8px 0 6px',
                  fontFamily: 'var(--font-serif)',
                  fontSize: 28,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                }}
              >
                Create your first order
              </h2>
              <p
                style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'oklch(1 0 0 / 0.68)' }}
              >
                Each API key is also a channel, so orders created through a key are tagged across
                dashboard, KDS, and analytics.
              </p>
            </div>
            <pre
              style={{
                margin: 0,
                padding: 18,
                borderRadius: 10,
                background: 'oklch(1 0 0 / 0.04)',
                border: '1px solid oklch(1 0 0 / 0.08)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                lineHeight: 1.7,
                color: 'oklch(1 0 0 / 0.85)',
                overflow: 'auto',
              }}
            >{`curl https://api.menukaze.com/v1/orders \\
  -H "Authorization: Bearer mkz_test_..." \\
  -H "Idempotency-Key: ord_847x91" \\
  -d '{
    "channel": "api",
    "items": [{ "id": "itm_91hk", "qty": 2 }]
  }'`}</pre>
          </div>
        </section>
        <div id="create-key">
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
      </div>
    </div>
  );
}
