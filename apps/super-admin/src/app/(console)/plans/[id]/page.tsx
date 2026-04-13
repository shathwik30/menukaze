import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { requireSuperAdmin } from '@/lib/session';
import { PlanForm } from '../new/plan-form';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPlanPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;
  const oid = parseObjectId(id);
  if (!oid) notFound();

  const conn = await getMongoConnection('live');
  const { Plan } = getModels(conn);
  const plan = await Plan.findById(oid).lean().exec();
  if (!plan) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/plans"
        className="text-muted-foreground mb-4 inline-block text-sm hover:underline"
      >
        &larr; Back to plans
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Edit Plan: {plan.name}</h1>
      <PlanForm
        planId={id}
        initial={{
          name: plan.name,
          monthlyMinor: plan.monthlyMinor,
          commissionBps: plan.commissionBps,
          flatFeeMinor: plan.flatFeeMinor,
          features: plan.features.join(', '),
          orderLimit: plan.orderLimit,
          trialDays: plan.trialDays,
        }}
      />
    </div>
  );
}
