import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireSuperAdmin } from '@/lib/session';
import { FlagEditor } from './flag-editor';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ key: string }>;
}

export default async function FlagDetailPage({ params }: Props) {
  await requireSuperAdmin();
  const { key } = await params;

  const conn = await getMongoConnection('live');
  const { FeatureFlag, Restaurant, Plan } = getModels(conn);

  const flag = await FeatureFlag.findOne({ key }).lean().exec();
  if (!flag) notFound();

  const overrideEntries = flag.restaurantOverrides
    ? Object.entries(Object.fromEntries(flag.restaurantOverrides))
    : [];
  const restaurantIds = overrideEntries.map(([id]) => id);
  const restaurants = restaurantIds.length
    ? await Restaurant.find({ _id: { $in: restaurantIds } }, { name: 1, slug: 1 })
        .lean()
        .exec()
    : [];

  const restaurantMap = new Map(
    restaurants.map((r) => [String(r._id), { name: r.name, slug: r.slug }]),
  );

  const overrides = overrideEntries.map(([id, enabled]) => ({
    restaurantId: id,
    name: restaurantMap.get(id)?.name ?? 'Unknown',
    slug: restaurantMap.get(id)?.slug ?? '',
    enabled: enabled as boolean,
  }));

  const plans = flag.planGates.length
    ? await Plan.find({ _id: { $in: flag.planGates } }, { name: 1 })
        .lean()
        .exec()
    : [];

  const allPlans = await Plan.find({ active: true }, { name: 1 }).lean().exec();

  const data = {
    key: flag.key,
    label: flag.label,
    description: flag.description ?? '',
    globallyEnabled: flag.globallyEnabled,
    overrides,
    planGates: plans.map((p) => ({ id: String(p._id), name: p.name })),
    allPlans: allPlans.map((p) => ({ id: String(p._id), name: p.name })),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/flags"
        className="text-muted-foreground mb-4 inline-block text-sm hover:underline"
      >
        &larr; Back to flags
      </Link>
      <FlagEditor data={data} />
    </div>
  );
}
