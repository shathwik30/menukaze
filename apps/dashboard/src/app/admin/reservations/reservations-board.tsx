'use client';

import { Button } from '@menukaze/ui';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateReservationStatusAction } from '@/app/actions/reservations';

interface Reservation {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  partySize: number;
  date: string;
  slotStart: string;
  slotEnd: string;
  notes: string | null;
  status: string;
  autoConfirmed: boolean;
  createdAt: string;
}

interface Props {
  reservations: Reservation[];
  canEdit: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  seated: 'Seated',
  no_show: 'No-show',
  completed: 'Completed',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  confirmed: 'bg-emerald-100 text-emerald-900',
  cancelled: 'bg-zinc-200 text-zinc-700 line-through',
  seated: 'bg-sky-100 text-sky-900',
  no_show: 'bg-red-100 text-red-900',
  completed: 'bg-zinc-100 text-zinc-700',
};

const NEXT_ACTIONS: Record<
  string,
  Array<{ status: string; label: string; tone: 'primary' | 'neutral' | 'danger' }>
> = {
  pending: [
    { status: 'confirmed', label: 'Confirm', tone: 'primary' },
    { status: 'cancelled', label: 'Cancel', tone: 'danger' },
  ],
  confirmed: [
    { status: 'seated', label: 'Seat', tone: 'primary' },
    { status: 'no_show', label: 'No-show', tone: 'danger' },
    { status: 'cancelled', label: 'Cancel', tone: 'neutral' },
  ],
  seated: [{ status: 'completed', label: 'Complete', tone: 'primary' }],
  cancelled: [],
  no_show: [],
  completed: [],
};

export function ReservationsBoard({ reservations, canEdit }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of reservations) {
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [reservations]);

  const onTransition = (reservationId: string, status: string): void => {
    setError(null);
    setPendingId(reservationId);
    startTransition(async () => {
      const result = await updateReservationStatusAction({ reservationId, status });
      if (!result.ok) setError(result.error);
      setPendingId(null);
      router.refresh();
    });
  };

  if (reservations.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No reservations yet. Once customers book, they appear here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {grouped.map(([date, list]) => (
        <section key={date} className="border-border rounded-md border">
          <header className="border-border bg-muted/40 border-b px-4 py-2">
            <h2 className="text-sm font-semibold">{date}</h2>
            <p className="text-muted-foreground text-xs">
              {list.length} booking{list.length === 1 ? '' : 's'}
            </p>
          </header>
          <ul className="divide-border divide-y">
            {list.map((r) => {
              const actions = canEdit ? (NEXT_ACTIONS[r.status] ?? []) : [];
              const isPending = pending && pendingId === r.id;
              return (
                <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs">{r.slotStart}</span>
                      <span className="font-medium">{r.name}</span>
                      <span className="text-muted-foreground text-xs">
                        · {r.partySize} guest{r.partySize === 1 ? '' : 's'}
                      </span>
                      <span
                        className={`rounded-sm px-2 py-0.5 text-[11px] tracking-wide uppercase ${STATUS_COLORS[r.status] ?? ''}`}
                      >
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      <a href={`mailto:${r.email}`} className="underline">
                        {r.email}
                      </a>
                      {r.phone ? (
                        <>
                          {' · '}
                          <a href={`tel:${r.phone}`} className="underline">
                            {r.phone}
                          </a>
                        </>
                      ) : null}
                    </p>
                    {r.notes ? (
                      <p className="text-muted-foreground mt-1 text-xs italic">“{r.notes}”</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {actions.map((a) => (
                      <Button
                        variant="plain"
                        size="none"
                        key={a.status}
                        type="button"
                        onClick={() => onTransition(r.id, a.status)}
                        disabled={isPending}
                        className={
                          a.tone === 'primary'
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center rounded-md px-3 text-xs font-medium disabled:opacity-50'
                            : a.tone === 'danger'
                              ? 'inline-flex h-8 items-center rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50'
                              : 'border-border hover:bg-muted inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium disabled:opacity-50'
                        }
                      >
                        {isPending ? '…' : a.label}
                      </Button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
