'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useCallback, type FormEvent } from 'react';
import { cn } from '@menukaze/ui';

interface MerchantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  onboardingStep: string;
  orderCount: number;
  liveAt: string | null;
  createdAt: string;
}

interface Props {
  rows: MerchantRow[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  statusFilter: string;
  onboardingFilter: string;
}

const STATUS_OPTIONS = ['', 'trial', 'active', 'past_due', 'suspended', 'cancelled'] as const;
const ONBOARDING_OPTIONS = [
  '',
  'menu',
  'tables',
  'razorpay',
  'staff',
  'go-live',
  'complete',
] as const;

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

export function MerchantList({
  rows,
  total,
  page,
  pageSize,
  search,
  statusFilter,
  onboardingFilter,
}: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(search);
  const totalPages = Math.ceil(total / pageSize);

  const navigate = useCallback(
    (overrides: Record<string, string>) => {
      const p = new URLSearchParams();
      const merged = {
        search: searchInput,
        status: statusFilter,
        onboarding: onboardingFilter,
        page: String(page),
        ...overrides,
      };
      for (const [k, v] of Object.entries(merged)) {
        if (v) p.set(k, v);
      }
      router.push(`/merchants?${p.toString()}`);
    },
    [router, searchInput, statusFilter, onboardingFilter, page],
  );

  function onSearch(e: FormEvent) {
    e.preventDefault();
    navigate({ search: searchInput, page: '1' });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <form onSubmit={onSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Search name, slug, or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="border-input focus-visible:ring-ring rounded-md border bg-transparent px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <button
            type="submit"
            className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium"
          >
            Search
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => navigate({ status: e.target.value, page: '1' })}
          className="border-input rounded-md border bg-transparent px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>

        <select
          value={onboardingFilter}
          onChange={(e) => navigate({ onboarding: e.target.value, page: '1' })}
          className="border-input rounded-md border bg-transparent px-2 py-1.5 text-sm"
        >
          <option value="">All onboarding</option>
          {ONBOARDING_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s.replace('-', ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border bg-muted/50 border-b text-left">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Onboarding</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
              <th className="px-4 py-3 font-medium">Signed up</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-8 text-center">
                  No merchants found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-border hover:bg-muted/30 border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/merchants/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="text-muted-foreground px-4 py-3 font-mono text-xs">{r.slug}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.onboardingStep === 'complete' ? (
                      <span className="text-green-700">Complete</span>
                    ) : (
                      <span className="text-muted-foreground">{r.onboardingStep}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.orderCount.toLocaleString()}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => navigate({ page: String(page - 1) })}
              className="border-input rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => navigate({ page: String(page + 1) })}
              className="border-input rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
