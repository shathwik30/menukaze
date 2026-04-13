import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/session';
import { PlanForm } from './plan-form';

export const dynamic = 'force-dynamic';

export default async function NewPlanPage() {
  await requireSuperAdmin();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/plans"
        className="text-muted-foreground mb-4 inline-block text-sm hover:underline"
      >
        &larr; Back to plans
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Create Plan</h1>
      <PlanForm />
    </div>
  );
}
