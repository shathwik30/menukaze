import { getMongoConnection, getModels } from '@menukaze/db';
import { requireSuperAdmin } from '@/lib/session';
import { FunnelChart } from './funnel-chart';
import { StuckMerchants } from './stuck-merchants';

export const dynamic = 'force-dynamic';

const ONBOARDING_STEPS = ['menu', 'tables', 'razorpay', 'staff', 'go-live', 'complete'] as const;

export default async function OnboardingPage() {
  await requireSuperAdmin();
  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneDayMs = 24 * 60 * 60 * 1000;

  const [totalSignups, stepCounts, liveRestaurants, stuckRestaurantsRaw] = await Promise.all([
    Restaurant.countDocuments().exec(),
    Restaurant.aggregate([
      { $group: { _id: '$onboardingStep', count: { $sum: 1 } } },
    ]).exec() as Promise<Array<{ _id: string; count: number }>>,
    Restaurant.find({ liveAt: { $ne: null } }, { liveAt: 1, createdAt: 1 })
      .lean()
      .exec(),
    Restaurant.find(
      {
        liveAt: null,
        onboardingStep: { $ne: 'complete' },
        createdAt: { $lt: sevenDaysAgo },
      },
      { name: 1, slug: 1, onboardingStep: 1, createdAt: 1 },
    )
      .sort({ createdAt: 1 })
      .limit(100)
      .lean()
      .exec(),
  ]);

  // Build step counts map
  const stepMap = new Map<string, number>();
  for (const s of stepCounts) stepMap.set(s._id, s.count);

  // Funnel: how many reached each step (cumulative from complete backwards)
  // "reached step X" means they are currently on step X or any step after X
  const stepOrder = [...ONBOARDING_STEPS];
  const funnel: Array<{ step: string; count: number }> = [];
  let cumulative = 0;
  for (let i = stepOrder.length - 1; i >= 0; i--) {
    cumulative += stepMap.get(stepOrder[i]!) ?? 0;
    funnel.unshift({ step: stepOrder[i]!, count: cumulative });
  }

  // Time-to-live metrics
  const timeToLiveDays = liveRestaurants.map((r) => {
    const diff = (r.liveAt!.getTime() - r.createdAt.getTime()) / oneDayMs;
    return Math.max(0, diff);
  });

  const avgTimeToLive =
    timeToLiveDays.length > 0
      ? timeToLiveDays.reduce((a, b) => a + b, 0) / timeToLiveDays.length
      : 0;
  const dayOneCompletion = timeToLiveDays.filter((d) => d <= 1).length;
  const sevenDayCompletion = timeToLiveDays.filter((d) => d <= 7).length;
  const neverCompleted = totalSignups - liveRestaurants.length;

  const stuckMerchants = stuckRestaurantsRaw.map((r) => ({
    id: String(r._id),
    name: r.name,
    slug: r.slug,
    onboardingStep: r.onboardingStep,
    createdAt: r.createdAt.toISOString(),
    daysStuck: Math.floor((now.getTime() - r.createdAt.getTime()) / oneDayMs),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <h1 className="text-2xl font-bold">Onboarding Analytics</h1>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="border-border rounded-lg border p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Avg Time to Live
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{avgTimeToLive.toFixed(1)}d</p>
        </div>
        <div className="border-border rounded-lg border p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Day-1 Completion
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {totalSignups > 0 ? ((dayOneCompletion / totalSignups) * 100).toFixed(1) : 0}%
          </p>
          <p className="text-muted-foreground text-xs">{dayOneCompletion} merchants</p>
        </div>
        <div className="border-border rounded-lg border p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            7-Day Completion
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {totalSignups > 0 ? ((sevenDayCompletion / totalSignups) * 100).toFixed(1) : 0}%
          </p>
          <p className="text-muted-foreground text-xs">{sevenDayCompletion} merchants</p>
        </div>
        <div className="border-border rounded-lg border p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Never Completed
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {totalSignups > 0 ? ((neverCompleted / totalSignups) * 100).toFixed(1) : 0}%
          </p>
          <p className="text-muted-foreground text-xs">{neverCompleted} merchants</p>
        </div>
      </div>

      {/* Funnel */}
      <section className="border-border rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">Onboarding Funnel</h2>
        <FunnelChart steps={funnel} total={totalSignups} />
      </section>

      {/* Stuck merchants */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Stuck Merchants ({stuckMerchants.length})</h2>
        <StuckMerchants merchants={stuckMerchants} />
      </section>
    </div>
  );
}
