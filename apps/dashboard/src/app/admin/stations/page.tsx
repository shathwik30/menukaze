import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { StationsManager } from './stations-manager';

export const dynamic = 'force-dynamic';

export default async function StationsPage() {
  const { restaurantId } = await requirePageFlag(['kds.configure']);
  const conn = await getMongoConnection('live');
  const { Station } = getModels(conn);
  const stations = await Station.find({ restaurantId, archived: false })
    .sort({ order: 1 })
    .lean()
    .exec();

  return (
    <div>
      <div
        style={{
          padding: '14px 40px 12px',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 3,
              height: 28,
              borderRadius: 99,
              background: 'var(--mk-saffron-500)',
              flexShrink: 0,
            }}
          />
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--mk-saffron-700)',
              }}
            >
              Kitchen display
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif)',
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: 'var(--mk-ink-950)',
                lineHeight: 1.2,
              }}
            >
              Stations
            </h1>
          </div>
        </div>
        <Link
          href="/admin/kds"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12.5,
            fontWeight: 500,
            color: 'var(--mk-ink-500)',
            textDecoration: 'none',
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid var(--mk-ink-200)',
          }}
        >
          ← Back to KDS
        </Link>
      </div>
      <div style={{ padding: '20px 40px 48px' }}>
        <StationsManager
          initial={stations.map((s) => ({
            id: String(s._id),
            name: s.name,
            color: s.color ?? '',
            soundEnabled: s.soundEnabled,
          }))}
        />
      </div>
    </div>
  );
}
