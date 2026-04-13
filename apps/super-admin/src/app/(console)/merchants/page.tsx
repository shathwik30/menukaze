import { getMongoConnection, getModels } from '@menukaze/db';
import { requireSuperAdmin } from '@/lib/session';
import { MerchantList } from './merchant-list';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    onboarding?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 20;

export default async function MerchantsPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const params = await searchParams;
  const search = params.search?.trim() ?? '';
  const statusFilter = params.status ?? '';
  const onboardingFilter = params.onboarding ?? '';
  const page = Math.max(1, Number(params.page) || 1);

  const conn = await getMongoConnection('live');
  const { Restaurant, Order } = getModels(conn);

  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  if (statusFilter) filter.subscriptionStatus = statusFilter;
  if (onboardingFilter) filter.onboardingStep = onboardingFilter;

  const [restaurants, total] = await Promise.all([
    Restaurant.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean()
      .exec(),
    Restaurant.countDocuments(filter).exec(),
  ]);

  // Batch order counts
  const orderCounts = await Promise.all(
    restaurants.map((r) =>
      Order.countDocuments({ restaurantId: r._id }, { skipTenantGuard: true }).exec(),
    ),
  );

  const rows = restaurants.map((r, i) => ({
    id: String(r._id),
    name: r.name,
    slug: r.slug,
    status: r.subscriptionStatus,
    onboardingStep: r.onboardingStep,
    orderCount: orderCounts[i] ?? 0,
    liveAt: r.liveAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Merchants</h1>
        <span className="text-muted-foreground text-sm">{total} total</span>
      </div>
      <MerchantList
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        search={search}
        statusFilter={statusFilter}
        onboardingFilter={onboardingFilter}
      />
    </div>
  );
}
