import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/session';
import { FlagCreateForm } from './flag-create-form';

export const dynamic = 'force-dynamic';

export default async function NewFlagPage() {
  await requireSuperAdmin();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/flags"
        className="text-muted-foreground mb-4 inline-block text-sm hover:underline"
      >
        &larr; Back to flags
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Create Feature Flag</h1>
      <FlagCreateForm />
    </div>
  );
}
