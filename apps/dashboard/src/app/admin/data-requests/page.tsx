import Link from 'next/link';
import { requireAnyPageFlag } from '@/lib/session';
import { DataRequestsClient } from './data-requests-client';

export const dynamic = 'force-dynamic';

export default async function DataRequestsPage() {
  const { permissions } = await requireAnyPageFlag(['customers.export', 'customers.delete']);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customer data requests</h1>
          <p className="text-muted-foreground text-sm">
            Export or anonymise a customer&apos;s data on this restaurant. Used to fulfil GDPR /
            DPDPA / similar data subject requests.
          </p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      <DataRequestsClient
        canExport={permissions.includes('customers.export')}
        canDelete={permissions.includes('customers.delete')}
      />
    </main>
  );
}
