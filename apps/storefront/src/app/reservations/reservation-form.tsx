'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  computeAvailableSlots,
  type BookedSlot,
  type ReservationSettings,
  type RestaurantHourEntry,
} from '@menukaze/shared';
import {
  Button,
  Card,
  FieldError,
  FieldHint,
  Input,
  Label,
  Radio,
  Select,
  Textarea,
  cn,
} from '@menukaze/ui';
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
    <Card className="p-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <Label>Date</Label>
            <Select
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSlot('');
              }}
            >
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <Label>Guests</Label>
            <Select value={partySize} onChange={(e) => setPartySize(Number(e.target.value))}>
              {partyOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
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
                    className={cn(
                      'border-border flex cursor-pointer flex-col items-center justify-center rounded-md border p-2 text-xs transition-colors',
                      checked ? 'bg-foreground text-background' : 'hover:bg-muted',
                    )}
                  >
                    <Radio
                      name="slot"
                      value={value}
                      checked={checked}
                      onChange={() => setSlot(value)}
                      className="sr-only"
                    />
                    <span className="font-medium">{option.slotStart}</span>
                    {option.hasBookings ? (
                      <span className="text-[10px] tracking-wide uppercase opacity-70">
                        Limited
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <label className="flex flex-col gap-1.5 text-sm">
          <Label>Name</Label>
          <Input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <Label>Email</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <Label>
            Phone <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <Label>
            Notes <span className="text-muted-foreground">(allergies, occasion, etc.)</span>
          </Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
          />
        </label>

        {error ? <FieldError>{error}</FieldError> : null}
        {success ? <FieldHint className="text-emerald-600">{success}</FieldHint> : null}

        <Button type="submit" disabled={submitting} loading={submitting} className="mt-2" full>
          Request reservation
        </Button>
      </form>
    </Card>
  );
}
