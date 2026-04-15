'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateReservationSettingsAction } from '@/app/actions/reservations';

interface Settings {
  enabled: boolean;
  slotMinutes: number;
  maxPartySize: number;
  bufferMinutes: number;
  autoConfirm: boolean;
  reminderHours: number;
  blockedDates: string[];
}

export function ReservationSettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [state, setState] = useState<Settings>(initial);
  const [newBlockedDate, setNewBlockedDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSave = (): void => {
    setError(null);
    setSuccess(null);
    start(async () => {
      const result = await updateReservationSettingsAction(state);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess('Saved.');
      router.refresh();
    });
  };

  const addBlockedDate = (): void => {
    const d = newBlockedDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    if (state.blockedDates.includes(d)) return;
    setState({ ...state, blockedDates: [...state.blockedDates, d].sort() });
    setNewBlockedDate('');
  };

  const removeBlockedDate = (d: string): void => {
    setState({ ...state, blockedDates: state.blockedDates.filter((x) => x !== d) });
  };

  return (
    <div className="border-border space-y-4 rounded-md border p-5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => setState({ ...state, enabled: e.target.checked })}
        />
        <span className="font-medium">Accept online reservations</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.autoConfirm}
          onChange={(e) => setState({ ...state, autoConfirm: e.target.checked })}
          disabled={!state.enabled}
        />
        <span>Auto-confirm bookings (otherwise pending until approved)</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Slot length (minutes)</span>
          <input
            type="number"
            min={15}
            max={240}
            step={15}
            value={state.slotMinutes}
            onChange={(e) => setState({ ...state, slotMinutes: Number(e.target.value) })}
            className="border-border h-9 rounded-md border px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Max party size</span>
          <input
            type="number"
            min={1}
            max={200}
            value={state.maxPartySize}
            onChange={(e) => setState({ ...state, maxPartySize: Number(e.target.value) })}
            className="border-border h-9 rounded-md border px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Buffer between slots (minutes)</span>
          <input
            type="number"
            min={0}
            max={120}
            value={state.bufferMinutes}
            onChange={(e) => setState({ ...state, bufferMinutes: Number(e.target.value) })}
            className="border-border h-9 rounded-md border px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Reminder lead time (hours)</span>
          <input
            type="number"
            min={0}
            max={168}
            value={state.reminderHours}
            onChange={(e) => setState({ ...state, reminderHours: Number(e.target.value) })}
            className="border-border h-9 rounded-md border px-3 text-sm"
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Blocked dates</legend>
        <p className="text-muted-foreground text-xs">
          No bookings accepted on these dates (e.g. private events, holidays).
        </p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={newBlockedDate}
            onChange={(e) => setNewBlockedDate(e.target.value)}
            className="border-border h-9 rounded-md border px-3 text-sm"
          />
          <button
            type="button"
            onClick={addBlockedDate}
            className="border-border hover:bg-muted inline-flex h-9 items-center rounded-md border px-3 text-sm"
          >
            Add
          </button>
        </div>
        {state.blockedDates.length > 0 ? (
          <ul className="flex flex-wrap gap-2 pt-2">
            {state.blockedDates.map((d) => (
              <li
                key={d}
                className="border-border flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
              >
                <span className="font-mono">{d}</span>
                <button
                  type="button"
                  onClick={() => removeBlockedDate(d)}
                  className="text-red-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">No blocked dates.</p>
        )}
      </fieldset>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}
