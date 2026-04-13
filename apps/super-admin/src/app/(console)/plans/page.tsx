import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireSuperAdmin } from '@/lib/session';
import { PlanList } from './plan-list';

export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  await requireSuperAdmin();
  const conn = await getMongoConnection('live');
  const { Plan } = getModels(conn);

  const plans = await Plan.find().sort({ monthlyMinor: 1 }).lean().exec();

  const rows = plans.map((p) => ({
    id: String(p._id),
    name: p.name,
    monthlyMinor: p.monthlyMinor,
    commissionBps: p.commissionBps,
    flatFeeMinor: p.flatFeeMinor,
    features: p.features,
    orderLimit: p.orderLimit,
    trialDays: p.trialDays,
    active: p.active,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plans</h1>
        <Link
          href="/plans/new"
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
        >
          Create Plan
        </Link>
      </div>
      <PlanList rows={rows} />
    </div>
  );
}
