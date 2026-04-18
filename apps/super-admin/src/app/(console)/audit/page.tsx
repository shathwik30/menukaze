import { getMongoConnection, getModels } from '@menukaze/db';
import { requireSuperAdmin } from '@/lib/session';
import { AuditTable } from './audit-table';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ page?: string; action?: string }>;
}

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const actionFilter = params.action?.trim() ?? '';

  const conn = await getMongoConnection('live');
  const { PlatformAuditLog, User, Restaurant } = getModels(conn);

  const filter: Record<string, unknown> = {};
  if (actionFilter) filter.action = { $regex: actionFilter, $options: 'i' };

  const [logs, total] = await Promise.all([
    PlatformAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean()
      .exec(),
    PlatformAuditLog.countDocuments(filter).exec(),
  ]);

  const actorIds = [...new Set(logs.map((l) => l.actorUserId))];
  const targetRestIds = [
    ...new Set(logs.filter((l) => l.targetRestaurantId).map((l) => l.targetRestaurantId!)),
  ];

  const [actors, targets] = await Promise.all([
    actorIds.length
      ? User.find({ _id: { $in: actorIds } }, { name: 1, email: 1 })
          .lean()
          .exec()
      : [],
    targetRestIds.length
      ? Restaurant.find({ _id: { $in: targetRestIds } }, { name: 1 })
          .lean()
          .exec()
      : [],
  ]);

  const actorMap = new Map(actors.map((a) => [String(a._id), { name: a.name, email: a.email }]));
  const targetMap = new Map(targets.map((t) => [String(t._id), t.name]));

  const rows = logs.map((l) => {
    const actor = actorMap.get(String(l.actorUserId));
    return {
      id: String(l._id),
      action: l.action,
      resource: l.resource,
      resourceId: l.resourceId ?? '',
      actorName: actor?.name ?? 'Unknown',
      actorEmail: actor?.email ?? '',
      targetRestaurant: l.targetRestaurantId
        ? (targetMap.get(String(l.targetRestaurantId)) ?? '')
        : '',
      ip: l.ip,
      diff: l.diff ?? null,
      createdAt: l.createdAt.toISOString(),
    };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-2xl font-bold">Audit Log</h1>
      <AuditTable
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        actionFilter={actionFilter}
      />
    </div>
  );
}
