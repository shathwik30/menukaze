'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  computeAvailableSlots,
  type BookedSlot,
  type ReservationSettings,
  type RestaurantHourEntry,
} from '@menukaze/shared';
import { createReservationAction } from '@/app/actions/reservation';

interface Props {
  restaurantId: string;
  restaurantName: string;
  availableDates: string[];
  bookings: BookedSlot[];
  hours: RestaurantHourEntry[];
  settings: ReservationSettings;
}

export function ReservationForm({
  restaurantId,
  restaurantName,
  availableDates,
  bookings,
  hours,
  settings,
}: Props) {
  const [date, setDate] = useState<string>(availableDates[0] ?? '');
  const [slot, setSlot] = useState<string>('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState<number>(2);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const slots = useMemo(
    () => computeAvailableSlots({ date, hours, settings, bookings }),
    [date, hours, settings, bookings],
  );

  const partyOptions = useMemo(
    () => Array.from({ length: settings.maxPartySize }, (_, i) => i + 1),
    [settings.maxPartySize],
  );

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!slot) {
      setError('Pick a time slot.');
      return;
    }
    const [slotStart, slotEnd] = slot.split('|') as [string, string];
    startSubmit(async () => {
      const result = await createReservationAction({
        restaurantId,
        name,
        email,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        partySize,
        date,
        slotStart,
        slotEnd,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        result.status === 'confirmed'
          ? `You're booked at ${restaurantName} on ${date} at ${slotStart}. Check your email for the confirmation.`
          : `Request received. ${restaurantName} will reply to ${email} once they review the booking.`,
      );
      setSlot('');
      setNotes('');
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="border-border bg-background flex flex-col gap-4 rounded-md border p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Date</span>
          <select
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSlot('');
            }}
            className="border-border h-10 rounded-md border px-3 text-sm"
          >
            {availableDates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Guests</span>
          <select
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
            className="border-border h-10 rounded-md border px-3 text-sm"
          >
            {partyOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Time</legend>
        {slots.length === 0 ? (
          <p className="text-muted-foreground text-sm">No slots available on that date.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((option) => {
              const value = `${option.slotStart}|${option.slotEnd}`;
              const checked = slot === value;
              return (
                <label
                  key={value}
                  className={`border-border flex cursor-pointer flex-col items-center justify-center rounded-md border p-2 text-xs ${
                    checked ? 'bg-foreground text-background' : 'hover:bg-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="slot"
                    value={value}
                    checked={checked}
                    onChange={() => setSlot(value)}
                    className="sr-only"
                  />
                  <span className="font-medium">{option.slotStart}</span>
                  {option.hasBookings ? (
                    <span className="text-[10px] tracking-wide uppercase opacity-70">Limited</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Name</span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-border h-10 rounded-md border px-3 text-sm"
          autoComplete="name"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-border h-10 rounded-md border px-3 text-sm"
          autoComplete="email"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Phone <span className="text-muted-foreground">(optional)</span>
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border-border h-10 rounded-md border px-3 text-sm"
          autoComplete="tel"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Notes <span className="text-muted-foreground">(allergies, occasion, etc.)</span>
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          className="border-border rounded-md border px-3 py-2 text-sm"
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 inline-flex h-11 items-center justify-center rounded-md text-sm font-semibold disabled:opacity-50"
      >
        {submitting ? 'Sending…' : 'Request reservation'}
      </button>
    </form>
  );
}
