'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FieldError, Input, Label, cn } from '@menukaze/ui';
import { createTablesStarterAction } from '@/app/actions/tables';

const CAPACITY_OPTIONS = [2, 4, 6, 8] as const;
type Capacity = (typeof CAPACITY_OPTIONS)[number];

const PREVIEW_CAP = 24;

const OPTIONS = [
  {
    value: 'yes' as const,
    title: 'Dine-in',
    desc: 'Tables with QR codes for ordering',
  },
  {
    value: 'no' as const,
    title: 'Takeaway only',
    desc: 'No tables — pickup or delivery',
  },
];

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
    if (hasTables === 'yes' && !validCount) {
      setError('Enter a table count between 1 and 200.');
      return;
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
    <form onSubmit={onSubmit} className="space-y-8">
      <div className="grid grid-cols-2 gap-3">
        {OPTIONS.map(({ value, title, desc }) => (
          <button
            key={value}
            type="button"
            onClick={() => setHasTables(value)}
            className={cn(
              'flex flex-col items-start gap-1 rounded-md border p-4 text-left transition-colors',
              hasTables === value
                ? 'border-foreground'
                : 'border-border hover:border-muted-foreground',
            )}
          >
            <span className="text-sm font-medium">{title}</span>
            <span className="text-muted-foreground text-xs">{desc}</span>
          </button>
        ))}
      </div>

      {hasTables === 'yes' ? (
        <div className="space-y-6">
          <div className="flex items-end gap-8">
            <div className="space-y-1.5">
              <Label>Number of tables</Label>
              <Input
                type="number"
                min="1"
                max="200"
                required
                value={tableCount}
                onChange={(e) => setTableCount(e.target.value)}
                className="w-24"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Seats per table</Label>
              <div className="flex gap-1.5">
                {CAPACITY_OPTIONS.map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => setCapacity(cap)}
                    className={cn(
                      'h-9 w-10 rounded-md border text-sm font-medium transition-colors',
                      cap === capacity
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border hover:border-muted-foreground bg-transparent',
                    )}
                  >
                    {cap}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {validCount ? <TableGridPreview count={count} capacity={capacity} /> : null}
        </div>
      ) : null}

      {error ? <FieldError>{error}</FieldError> : null}

      <Button type="submit" disabled={pending} full loading={pending}>
        Continue
      </Button>
    </form>
  );
}

function TableGridPreview({ count, capacity }: { count: number; capacity: number }) {
  const shown = Math.min(count, PREVIEW_CAP);
  const overflow = count - shown;

  return (
    <div className="space-y-2">
      <div className="border-border flex flex-wrap gap-1.5 rounded-md border p-3">
        {Array.from({ length: shown }, (_, i) => (
          <div
            key={i}
            className="border-border flex h-11 w-11 flex-col items-center justify-center rounded border"
          >
            <span className="text-foreground text-xs leading-none font-medium">{i + 1}</span>
            <span className="text-muted-foreground mt-0.5 text-[10px] leading-none">
              {capacity}p
            </span>
          </div>
        ))}
        {overflow > 0 ? (
          <div className="border-border flex h-11 w-11 flex-col items-center justify-center rounded border">
            <span className="text-muted-foreground text-xs font-medium">+{overflow}</span>
          </div>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        {count} {count === 1 ? 'table' : 'tables'} &middot; {capacity} seats each &middot;{' '}
        {count * capacity} total seats
      </p>
    </div>
  );
}
