import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { requireSuperAdmin } from '@/lib/session';
import { MerchantDetail } from './merchant-detail';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MerchantDetailPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;
  const oid = parseObjectId(id);
  if (!oid) notFound();

  const conn = await getMongoConnection('live');
  const { Restaurant, Order, StaffMembership, Plan, Subscription } = getModels(conn);

  const restaurant = await Restaurant.findById(oid).lean().exec();
  if (!restaurant) notFound();

  const [orderCount, revenueAgg, owner, subscription, plan] = await Promise.all([
    Order.countDocuments({ restaurantId: oid }, { skipTenantGuard: true }).exec(),
    Order.aggregate([
      { $match: { restaurantId: oid, 'payment.status': 'succeeded' } },
      { $group: { _id: null, total: { $sum: '$totalMinor' } } },
    ])
      .option({ skipTenantGuard: true })
      .exec(),
    StaffMembership.findOne(
      { restaurantId: oid, role: 'owner', status: 'active' },
      {},
      { skipTenantGuard: true },
    )
      .populate<{ userId: { _id: string; email: string; name: string } }>('userId', 'email name')
      .exec(),
    Subscription.findOne({ restaurantId: oid }).lean().exec(),
    restaurant.planId ? Plan.findById(restaurant.planId).lean().exec() : null,
  ]);

  const totalRevenue = (revenueAgg[0] as { total?: number } | undefined)?.total ?? 0;
  const ownerUser = owner?.userId as unknown as { email: string; name: string } | null;

  const data = {
    id: String(restaurant._id),
    name: restaurant.name,
    slug: restaurant.slug,
    email: restaurant.email ?? '',
    country: restaurant.country,
    currency: restaurant.currency,
    status: restaurant.subscriptionStatus,
    onboardingStep: restaurant.onboardingStep,
    liveAt: restaurant.liveAt?.toISOString() ?? null,
    createdAt: restaurant.createdAt.toISOString(),
    orderCount,
    totalRevenueMinor: totalRevenue,
    ownerEmail: ownerUser?.email ?? 'N/A',
    ownerName: ownerUser?.name ?? 'N/A',
    planName: plan?.name ?? 'No plan',
    subscriptionStatus: subscription?.status ?? null,
    featureFlags: Object.fromEntries(restaurant.featureFlags ?? new Map()),
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/merchants"
        className="text-muted-foreground mb-4 inline-block text-sm hover:underline"
      >
        &larr; Back to merchants
      </Link>
      <MerchantDetail data={data} />
    </div>
  );
}
