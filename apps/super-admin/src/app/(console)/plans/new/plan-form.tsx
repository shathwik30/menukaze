'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createPlanAction } from '@/app/actions/plans';

interface PlanFormProps {
  initial?: {
    name: string;
    monthlyMinor: number;
    commissionBps: number;
    flatFeeMinor: number;
    features: string;
    orderLimit: number | null;
    trialDays: number;
  };
  planId?: string;
}

export function PlanForm({ initial, planId }: PlanFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [monthlyMinor, setMonthlyMinor] = useState(initial?.monthlyMinor ?? 0);
  const [commissionBps, setCommissionBps] = useState(initial?.commissionBps ?? 0);
  const [flatFeeMinor, setFlatFeeMinor] = useState(initial?.flatFeeMinor ?? 0);
  const [features, setFeatures] = useState(initial?.features ?? '');
  const [orderLimit, setOrderLimit] = useState<string>(
    initial?.orderLimit != null ? String(initial.orderLimit) : '',
  );
  const [trialDays, setTrialDays] = useState(initial?.trialDays ?? 14);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      name,
      monthlyMinor,
      commissionBps,
      flatFeeMinor,
      features: features
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      orderLimit: orderLimit ? Number(orderLimit) : null,
      trialDays,
    };

    const result = planId
      ? await (await import('@/app/actions/plans')).updatePlanAction(planId, payload)
      : await createPlanAction(payload);

    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    router.push('/plans');
    router.refresh();
  }

  const inputClass =
    'border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2';

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Plan name</span>
        <input
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Monthly fee (minor units)</span>
          <input
            type="number"
            required
            min={0}
            value={monthlyMinor}
            onChange={(e) => setMonthlyMinor(Number(e.target.value))}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Commission (basis points)</span>
          <input
            type="number"
            required
            min={0}
            max={10000}
            value={commissionBps}
            onChange={(e) => setCommissionBps(Number(e.target.value))}
            className={inputClass}
          />
          <span className="text-muted-foreground mt-1 block text-xs">250 = 2.5%</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Flat fee per order (minor units)</span>
          <input
            type="number"
            required
            min={0}
            value={flatFeeMinor}
            onChange={(e) => setFlatFeeMinor(Number(e.target.value))}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Trial days</span>
          <input
            type="number"
            required
            min={0}
            value={trialDays}
            onChange={(e) => setTrialDays(Number(e.target.value))}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Features (comma-separated)</span>
        <input
          type="text"
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          placeholder="kiosk, multi_language, custom_domain"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Order limit (empty = unlimited)</span>
        <input
          type="number"
          min={0}
          value={orderLimit}
          onChange={(e) => setOrderLimit(e.target.value)}
          className={inputClass}
        />
      </label>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-6 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? 'Saving...' : planId ? 'Update Plan' : 'Create Plan'}
      </button>
    </form>
  );
}
