'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, cn } from '@menukaze/ui';
import { activatePlanAction, retirePlanAction } from '@/app/actions/plans';

interface PlanRow {
  id: string;
  name: string;
  monthlyMinor: number;
  commissionBps: number;
  flatFeeMinor: number;
  features: string[];
  orderLimit: number | null;
  trialDays: number;
  active: boolean;
}

export function PlanList({ rows }: { rows: PlanRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggleActive(planId: string, currentlyActive: boolean) {
    setBusy(planId);
    const result = currentlyActive
      ? await retirePlanAction(planId)
      : await activatePlanAction(planId);
    if (result.ok) router.refresh();
    setBusy(null);
  }

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border bg-muted/50 border-b text-left">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 text-right font-medium">Monthly</th>
            <th className="px-4 py-3 text-right font-medium">Commission</th>
            <th className="px-4 py-3 text-right font-medium">Flat Fee</th>
            <th className="px-4 py-3 font-medium">Features</th>
            <th className="px-4 py-3 text-right font-medium">Trial</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="text-muted-foreground px-4 py-8 text-center">
                No plans yet.
              </td>
            </tr>
          ) : (
            rows.map((p) => (
              <tr key={p.id} className="border-border hover:bg-muted/30 border-b last:border-0">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {(p.monthlyMinor / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {(p.commissionBps / 100).toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {(p.flatFeeMinor / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {p.features.map((f) => (
                      <span key={f} className="bg-muted rounded px-1.5 py-0.5 text-xs">
                        {f}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{p.trialDays}d</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                      p.active ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600',
                    )}
                  >
                    {p.active ? 'Active' : 'Retired'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link
                      href={`/plans/${p.id}`}
                      className="text-muted-foreground text-xs hover:underline"
                    >
                      Edit
                    </Link>
                    <Button
                      variant="plain"
                      size="none"
                      disabled={busy === p.id}
                      onClick={() => toggleActive(p.id, p.active)}
                      className="text-muted-foreground text-xs hover:underline disabled:opacity-50"
                    >
                      {p.active ? 'Retire' : 'Activate'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
