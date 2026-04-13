import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireSuperAdmin } from '@/lib/session';
import { FlagsList } from './flags-list';

export const dynamic = 'force-dynamic';

export default async function FlagsPage() {
  await requireSuperAdmin();
  const conn = await getMongoConnection('live');
  const { FeatureFlag } = getModels(conn);

  const flags = await FeatureFlag.find().sort({ key: 1 }).lean().exec();

  const rows = flags.map((f) => ({
    key: f.key,
    label: f.label,
    description: f.description ?? '',
    globallyEnabled: f.globallyEnabled,
    overrideCount: f.restaurantOverrides
      ? Object.keys(Object.fromEntries(f.restaurantOverrides)).length
      : 0,
    planGateCount: f.planGates.length,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <Link
          href="/flags/new"
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
        >
          Create Flag
        </Link>
      </div>
      <FlagsList rows={rows} />
    </div>
  );
}
