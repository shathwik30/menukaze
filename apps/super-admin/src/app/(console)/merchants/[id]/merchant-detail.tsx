'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateMerchantStatusAction } from '@/app/actions/merchants';
import { cn } from '@menukaze/ui';

interface MerchantData {
  id: string;
  name: string;
  slug: string;
  email: string;
  country: string;
  currency: string;
  status: string;
  onboardingStep: string;
  liveAt: string | null;
  createdAt: string;
  orderCount: number;
  totalRevenueMinor: number;
  ownerEmail: string;
  ownerName: string;
  planName: string;
  subscriptionStatus: string | null;
  featureFlags: Record<string, boolean>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    trial: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    past_due: 'bg-yellow-100 text-yellow-800',
    suspended: 'bg-red-100 text-red-800',
    cancelled: 'bg-neutral-100 text-neutral-600',
  };
  return (
    <span
      className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', colors[status])}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border flex justify-between border-b py-2 last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export function MerchantDetail({ data }: { data: MerchantData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function handleStatusChange(newStatus: 'active' | 'suspended' | 'cancelled') {
    setBusy(true);
    setError(null);
    setConfirm(null);
    const result = await updateMerchantStatusAction(data.id, newStatus);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  const flagEntries = Object.entries(data.featureFlags);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{data.name}</h1>
          <p className="text-muted-foreground font-mono text-sm">{data.slug}</p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {/* Profile */}
      <section className="border-border rounded-lg border p-4">
        <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
          Profile
        </h2>
        <InfoRow label="Owner" value={`${data.ownerName} (${data.ownerEmail})`} />
        <InfoRow label="Email" value={data.email || 'Not set'} />
        <InfoRow label="Country" value={data.country} />
        <InfoRow label="Currency" value={data.currency} />
        <InfoRow label="Signed up" value={new Date(data.createdAt).toLocaleDateString()} />
        <InfoRow
          label="Live since"
          value={data.liveAt ? new Date(data.liveAt).toLocaleDateString() : 'Not live'}
        />
      </section>

      {/* Onboarding */}
      <section className="border-border rounded-lg border p-4">
        <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
          Onboarding
        </h2>
        <InfoRow label="Current step" value={data.onboardingStep} />
      </section>

      {/* Billing */}
      <section className="border-border rounded-lg border p-4">
        <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
          Billing
        </h2>
        <InfoRow label="Plan" value={data.planName} />
        <InfoRow label="Subscription" value={data.subscriptionStatus ?? 'None'} />
      </section>

      {/* Stats */}
      <section className="border-border rounded-lg border p-4">
        <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
          Statistics
        </h2>
        <InfoRow label="Total orders" value={data.orderCount.toLocaleString()} />
        <InfoRow
          label="Total revenue"
          value={`${(data.totalRevenueMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${data.currency}`}
        />
      </section>

      {/* Feature Flags */}
      {flagEntries.length > 0 && (
        <section className="border-border rounded-lg border p-4">
          <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
            Feature Flags
          </h2>
          {flagEntries.map(([key, val]) => (
            <InfoRow key={key} label={key} value={val ? 'Enabled' : 'Disabled'} />
          ))}
        </section>
      )}

      {/* Actions */}
      <section className="border-border rounded-lg border p-4">
        <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
          Actions
        </h2>
        {error && <p className="text-destructive mb-3 text-sm">{error}</p>}

        {confirm ? (
          <div className="bg-muted rounded-md p-3">
            <p className="mb-3 text-sm">
              Are you sure you want to <strong>{confirm}</strong> this merchant?
            </p>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() =>
                  handleStatusChange(
                    confirm === 'activate'
                      ? 'active'
                      : confirm === 'suspend'
                        ? 'suspended'
                        : 'cancelled',
                  )
                }
                className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {busy ? 'Processing...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="border-input rounded-md border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.status !== 'active' && (
              <button
                onClick={() => setConfirm('activate')}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Activate
              </button>
            )}
            {data.status !== 'suspended' && data.status !== 'cancelled' && (
              <button
                onClick={() => setConfirm('suspend')}
                className="rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Suspend
              </button>
            )}
            {data.status !== 'cancelled' && (
              <button
                onClick={() => setConfirm('deactivate')}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Deactivate
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
