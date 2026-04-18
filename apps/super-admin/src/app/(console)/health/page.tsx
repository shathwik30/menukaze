import { getMongoConnection, getModels } from '@menukaze/db';
import { requireSuperAdmin } from '@/lib/session';
import { HealthDashboard } from './health-dashboard';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  await requireSuperAdmin();
  const conn = await getMongoConnection('live');
  const { Restaurant, Order, TableSession } = getModels(conn);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalMerchants,
    activeMerchants,
    ordersToday,
    ordersThisWeek,
    ordersThisMonth,
    newSignupsWeek,
    newSignupsMonth,
    activeSessions,
    ordersPerDay,
    signupsPerDay,
  ] = await Promise.all([
    Restaurant.countDocuments().exec(),
    Restaurant.countDocuments({
      subscriptionStatus: { $in: ['trial', 'active'] },
    }).exec(),
    Order.countDocuments({ createdAt: { $gte: startOfToday } }, { skipTenantGuard: true }).exec(),
    Order.countDocuments({ createdAt: { $gte: startOfWeek } }, { skipTenantGuard: true }).exec(),
    Order.countDocuments({ createdAt: { $gte: startOfMonth } }, { skipTenantGuard: true }).exec(),
    Restaurant.countDocuments({ createdAt: { $gte: sevenDaysAgo } }).exec(),
    Restaurant.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }).exec(),
    TableSession.countDocuments({ status: 'active' }, { skipTenantGuard: true }).exec(),
    Order.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
      .option({ skipTenantGuard: true })
      .exec(),
    Restaurant.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec(),
  ]);

  const metrics = {
    totalMerchants,
    activeMerchants,
    ordersToday,
    ordersThisWeek,
    ordersThisMonth,
    newSignupsWeek,
    newSignupsMonth,
    activeSessions,
    ordersPerDay: (ordersPerDay as Array<{ _id: string; count: number }>).map((d) => ({
      date: d._id,
      value: d.count,
    })),
    signupsPerDay: (signupsPerDay as Array<{ _id: string; count: number }>).map((d) => ({
      date: d._id,
      value: d.count,
    })),
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold">Platform Health</h1>
      <HealthDashboard metrics={metrics} />
    </div>
  );
}
