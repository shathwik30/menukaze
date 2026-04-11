'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createTablesStarterAction } from '@/app/actions/tables';

export function TablesSetupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hasTables, setHasTables] = useState<'yes' | 'no'>('yes');
  const [tableCount, setTableCount] = useState('10');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const count = hasTables === 'yes' ? Number(tableCount) : undefined;
    if (hasTables === 'yes') {
      if (!Number.isInteger(count) || (count ?? 0) < 1 || (count ?? 0) > 200) {
        setError('Enter a table count between 1 and 200.');
        return;
      }
    }

    startTransition(async () => {
      const result = await createTablesStarterAction({
        hasTables,
        tableCount: count,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/onboarding/razorpay');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Do you have dine-in tables?</legend>

        <label className="border-input hover:bg-accent/50 flex cursor-pointer items-start gap-3 rounded-md border p-4">
          <input
            type="radio"
            name="hasTables"
            value="yes"
            checked={hasTables === 'yes'}
            onChange={() => setHasTables('yes')}
            className="mt-1"
          />
          <div>
            <div className="text-sm font-medium">Yes — I run a dine-in restaurant</div>
            <div className="text-muted-foreground text-xs">
              Each table gets a unique QR code customers scan to start a dine-in session.
            </div>
          </div>
        </label>

        <label className="border-input hover:bg-accent/50 flex cursor-pointer items-start gap-3 rounded-md border p-4">
          <input
            type="radio"
            name="hasTables"
            value="no"
            checked={hasTables === 'no'}
            onChange={() => setHasTables('no')}
            className="mt-1"
          />
          <div>
            <div className="text-sm font-medium">No — takeaway or delivery only</div>
            <div className="text-muted-foreground text-xs">
              Skip tables. You can still accept orders via the storefront and kiosk.
            </div>
          </div>
        </label>
      </fieldset>

      {hasTables === 'yes' ? (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">How many tables?</span>
          <input
            type="number"
            min="1"
            max="200"
            required
            value={tableCount}
            onChange={(event) => setTableCount(event.target.value)}
            className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            We&apos;ll create tables numbered 1 through {tableCount || 'N'} with a default capacity
            of 4. You can edit everything later from the dashboard.
          </p>
        </label>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
      >
        {pending
          ? 'Saving…'
          : hasTables === 'yes'
            ? 'Create tables and continue'
            : 'Skip and continue'}
      </button>
    </form>
  );
}
