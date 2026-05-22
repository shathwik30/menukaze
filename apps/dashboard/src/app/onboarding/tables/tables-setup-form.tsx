'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FieldError, FieldHint, Input, Label, Radio, cn } from '@menukaze/ui';
import { createTablesStarterAction } from '@/app/actions/tables';

const CAPACITY_OPTIONS = [2, 4, 6, 8] as const;
type Capacity = (typeof CAPACITY_OPTIONS)[number];

const PREVIEW_CAP = 24;

export function TablesSetupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hasTables, setHasTables] = useState<'yes' | 'no'>('yes');
  const [tableCount, setTableCount] = useState('10');
  const [capacity, setCapacity] = useState<Capacity>(4);

  const count = Number(tableCount);
  const validCount = Number.isInteger(count) && count >= 1 && count <= 200;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (hasTables === 'yes') {
      if (!validCount) {
        setError('Enter a table count between 1 and 200.');
        return;
      }
    }

    startTransition(async () => {
      const result = await createTablesStarterAction({
        hasTables,
        tableCount: hasTables === 'yes' ? count : undefined,
        defaultCapacity: capacity,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/onboarding/razorpay');
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Do you have dine-in tables?</legend>

        <label
          className={cn(
            'border-input hover:bg-accent/50 flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors',
            hasTables === 'yes' && 'bg-accent',
          )}
        >
          <Radio
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

        <label
          className={cn(
            'border-input hover:bg-accent/50 flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors',
            hasTables === 'no' && 'bg-accent',
          )}
        >
          <Radio
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
        <div className="space-y-5">
          <label className="block space-y-1.5">
            <Label>How many tables?</Label>
            <Input
              type="number"
              min="1"
              max="200"
              required
              value={tableCount}
              onChange={(event) => setTableCount(event.target.value)}
              className="w-32"
            />
            <FieldHint>Up to 200 tables. You can add or remove them later.</FieldHint>
          </label>

          <div className="space-y-2">
            <Label>Default seating capacity per table</Label>
            <div className="flex gap-2">
              {CAPACITY_OPTIONS.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => setCapacity(cap)}
                  className={cn(
                    'border-input flex h-10 w-14 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                    cap === capacity
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-accent bg-transparent',
                  )}
                >
                  {cap}
                </button>
              ))}
            </div>
            <FieldHint>
              Seats per table. Each table can be adjusted individually from the dashboard.
            </FieldHint>
          </div>

          {validCount && count > 0 ? <TableGridPreview count={count} capacity={capacity} /> : null}
        </div>
      ) : null}

      {error ? <FieldError>{error}</FieldError> : null}

      <Button type="submit" disabled={pending} full loading={pending}>
        {hasTables === 'yes' ? 'Create tables and continue' : 'Skip and continue'}
      </Button>
    </form>
  );
}

function TableGridPreview({ count, capacity }: { count: number; capacity: number }) {
  const shown = Math.min(count, PREVIEW_CAP);
  const overflow = count - shown;

  return (
    <div className="border-border bg-canvas-50 space-y-3 rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Preview</p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: shown }, (_, i) => (
          <div
            key={i}
            className="border-border bg-surface flex h-14 w-14 flex-col items-center justify-center rounded-md border text-center"
          >
            <span className="text-foreground text-xs leading-tight font-semibold">{i + 1}</span>
            <span className="text-muted-foreground mt-0.5 text-[10px] leading-tight">
              {capacity}p
            </span>
          </div>
        ))}
        {overflow > 0 ? (
          <div className="border-border bg-surface flex h-14 w-14 flex-col items-center justify-center rounded-md border text-center">
            <span className="text-muted-foreground text-xs font-semibold">+{overflow}</span>
            <span className="text-muted-foreground text-[10px]">more</span>
          </div>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        {count} {count === 1 ? 'table' : 'tables'} &middot; {capacity} seats each &middot;{' '}
        {count * capacity} seats total
      </p>
    </div>
  );
}
