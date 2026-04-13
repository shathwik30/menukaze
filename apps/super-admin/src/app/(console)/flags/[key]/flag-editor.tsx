'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleGlobalFlagAction,
  setFlagOverrideAction,
  updateFlagPlanGatesAction,
  deleteFlagAction,
} from '@/app/actions/flags';
import { cn } from '@menukaze/ui';

interface Override {
  restaurantId: string;
  name: string;
  slug: string;
  enabled: boolean;
}

interface PlanRef {
  id: string;
  name: string;
}

interface FlagData {
  key: string;
  label: string;
  description: string;
  globallyEnabled: boolean;
  overrides: Override[];
  planGates: PlanRef[];
  allPlans: PlanRef[];
}

export function FlagEditor({ data }: { data: FlagData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newOverrideId, setNewOverrideId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleToggleGlobal() {
    setBusy(true);
    await toggleGlobalFlagAction(data.key, !data.globallyEnabled);
    router.refresh();
    setBusy(false);
  }

  async function handleRemoveOverride(restaurantId: string) {
    setBusy(true);
    await setFlagOverrideAction(data.key, restaurantId, null);
    router.refresh();
    setBusy(false);
  }

  async function handleToggleOverride(restaurantId: string, currentValue: boolean) {
    setBusy(true);
    await setFlagOverrideAction(data.key, restaurantId, !currentValue);
    router.refresh();
    setBusy(false);
  }

  async function handleAddOverride() {
    if (!newOverrideId.trim()) return;
    setBusy(true);
    await setFlagOverrideAction(data.key, newOverrideId.trim(), true);
    setNewOverrideId('');
    router.refresh();
    setBusy(false);
  }

  async function handlePlanGateChange(planId: string, enabled: boolean) {
    setBusy(true);
    const current = data.planGates.map((p) => p.id);
    const updated = enabled ? [...current, planId] : current.filter((id) => id !== planId);
    await updateFlagPlanGatesAction(data.key, updated);
    router.refresh();
    setBusy(false);
  }

  async function handleDelete() {
    setBusy(true);
    const result = await deleteFlagAction(data.key);
    if (result.ok) {
      router.push('/flags');
      router.refresh();
    }
    setBusy(false);
  }

  const gatedPlanIds = new Set(data.planGates.map((p) => p.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{data.label}</h1>
        <p className="text-muted-foreground font-mono text-sm">{data.key}</p>
        {data.description && (
          <p className="text-muted-foreground mt-1 text-sm">{data.description}</p>
        )}
      </div>

      {/* Global toggle */}
      <section className="border-border rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Global Toggle</h2>
            <p className="text-muted-foreground text-xs">
              {data.globallyEnabled ? 'Enabled for all merchants' : 'Disabled globally'}
            </p>
          </div>
          <button
            disabled={busy}
            onClick={handleToggleGlobal}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
              data.globallyEnabled ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                data.globallyEnabled ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>
      </section>

      {/* Per-merchant overrides */}
      <section className="border-border rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Per-Merchant Overrides</h2>
        {data.overrides.length === 0 ? (
          <p className="text-muted-foreground text-sm">No overrides set.</p>
        ) : (
          <div className="mb-3 space-y-2">
            {data.overrides.map((o) => (
              <div key={o.restaurantId} className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{o.name}</span>
                  <span className="text-muted-foreground ml-2 font-mono text-xs">{o.slug}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={busy}
                    onClick={() => handleToggleOverride(o.restaurantId, o.enabled)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
                      o.enabled ? 'bg-primary' : 'bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                        o.enabled ? 'translate-x-4' : 'translate-x-0',
                      )}
                    />
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleRemoveOverride(o.restaurantId)}
                    className="text-destructive text-xs hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Restaurant ID"
            value={newOverrideId}
            onChange={(e) => setNewOverrideId(e.target.value)}
            className="border-input focus-visible:ring-ring flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <button
            disabled={busy || !newOverrideId.trim()}
            onClick={handleAddOverride}
            className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Add Override
          </button>
        </div>
      </section>

      {/* Plan gates */}
      <section className="border-border rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Plan Gates</h2>
        <p className="text-muted-foreground mb-3 text-xs">
          When plan gates are set, only merchants on these plans have access to this feature.
        </p>
        <div className="space-y-2">
          {data.allPlans.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gatedPlanIds.has(p.id)}
                onChange={(e) => handlePlanGateChange(p.id, e.target.checked)}
                disabled={busy}
                className="rounded"
              />
              <span className="text-sm">{p.name}</span>
            </label>
          ))}
          {data.allPlans.length === 0 && (
            <p className="text-muted-foreground text-sm">No plans available.</p>
          )}
        </div>
      </section>

      {/* Delete */}
      <section className="border-border rounded-lg border border-red-200 p-4">
        <h2 className="mb-2 text-sm font-semibold text-red-700">Danger Zone</h2>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <p className="text-sm">Delete this flag permanently?</p>
            <button
              disabled={busy}
              onClick={handleDelete}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Deleting...' : 'Confirm Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="border-input rounded-md border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Delete Flag
          </button>
        )}
      </section>
    </div>
  );
}
