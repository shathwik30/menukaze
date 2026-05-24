'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteReservationAction, updateReservationStatusAction } from '@/app/actions/reservations';

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

const STATUS_TONE: Record<string, 'warning' | 'info' | 'success' | 'danger' | 'subtle'> = {
  pending: 'warning',
  confirmed: 'info',
  cancelled: 'subtle',
  seated: 'success',
  no_show: 'danger',
  completed: 'subtle',
};

const NEXT_ACTIONS: Record<
  string,
  Array<{ status: string; label: string; primary?: boolean; danger?: boolean }>
> = {
  pending: [
    { status: 'confirmed', label: 'Confirm', primary: true },
    { status: 'cancelled', label: 'Cancel', danger: true },
  ],
  confirmed: [
    { status: 'seated', label: 'Seat now', primary: true },
    { status: 'no_show', label: 'No-show', danger: true },
    { status: 'cancelled', label: 'Cancel' },
  ],
  seated: [{ status: 'completed', label: 'Complete', primary: true }],
  cancelled: [],
  no_show: [],
  completed: [],
};

const TONE_STYLE = {
  success: { bg: 'var(--mk-jade-50)', fg: 'var(--mk-jade-700)', dot: 'var(--mk-jade-500)' },
  warning: {
    bg: 'var(--mk-saffron-50)',
    fg: 'var(--mk-saffron-800)',
    dot: 'var(--mk-saffron-500)',
  },
  danger: { bg: 'var(--mk-rose-50)', fg: 'var(--mk-rose-700)', dot: 'var(--mk-rose-500)' },
  info: { bg: 'var(--mk-lapis-50)', fg: 'var(--mk-lapis-700)', dot: 'var(--mk-lapis-500)' },
  subtle: { bg: 'var(--mk-canvas-200)', fg: 'var(--mk-ink-600)', dot: 'var(--mk-ink-400)' },
};

function timeToMinutes(value: string): number {
  const [rawHour, rawMinute] = value.split(':');
  const hour = Number.parseInt(rawHour ?? '', 10);
  const minute = Number.parseInt(rawMinute ?? '', 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function formatDateLabel(date: string, format: 'short' | 'full' = 'short'): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  if (format === 'full') {
    return parsed.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function ReservationsBoard({ reservations, canEdit }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(reservations[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);

  const grouped = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of reservations) {
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    }
    return Array.from(map.entries())
      .map(([date, rows]) => ({
        date,
        rows: rows.slice().sort((a, b) => a.slotStart.localeCompare(b.slotStart)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [reservations]);

  const initialDate =
    grouped.find((g) => g.date === today)?.date ??
    grouped.find((g) => g.date > today)?.date ??
    today;
  const [activeDate, setActiveDate] = useState(initialDate);
  const activeGroup = grouped.find((g) => g.date === activeDate) ?? grouped[0] ?? null;
  const activeRows = activeGroup?.rows ?? [];
  const selected = reservations.find((r) => r.id === selectedId) ?? activeRows[0] ?? null;

  const activeDateIndex = grouped.findIndex((g) => g.date === activeDate);
  const canPrev = activeDateIndex > 0;
  const canNext = activeDateIndex < grouped.length - 1;

  useEffect(() => {
    if (!activeGroup) return;
    if (selected?.date !== activeGroup.date) {
      setSelectedId(activeGroup.rows[0]?.id ?? null);
    }
  }, [activeGroup, selected]);

  useEffect(() => {
    setSearch('');
  }, [activeDate]);

  const stats = useMemo(() => {
    const covers = activeRows.reduce((s, r) => s + r.partySize, 0);
    const pendingCount = activeRows.filter((r) => r.status === 'pending').length;
    const seatedCount = activeRows.filter((r) => r.status === 'seated').length;
    return { total: activeRows.length, covers, seatedCount, pendingCount };
  }, [activeRows]);

  const displayRows = useMemo(() => {
    if (!search.trim()) return activeRows;
    const q = search.toLowerCase();
    return activeRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.phone ?? '').includes(q),
    );
  }, [activeRows, search]);

  const lunch = displayRows.filter((r) => parseInt(r.slotStart) < 17);
  const dinner = displayRows.filter((r) => parseInt(r.slotStart) >= 17);

  const isToday = activeDate === today;

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

  const onDelete = (reservationId: string, name: string): void => {
    if (!window.confirm(`Delete reservation for ${name}? This cannot be undone.`)) return;
    setError(null);
    setPendingId(reservationId);
    startTransition(async () => {
      const result = await deleteReservationAction({ reservationId });
      if (!result.ok) {
        setError(result.error);
        setPendingId(null);
        return;
      }
      setSelectedId(null);
      setPendingId(null);
      router.refresh();
    });
  };

  if (reservations.length === 0) {
    return (
      <div
        style={{
          padding: '60px 24px',
          textAlign: 'center',
          borderRadius: 14,
          border: '1.5px dashed var(--mk-ink-200)',
          background: 'var(--mk-canvas-50)',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 12 }}>📅</div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--mk-ink-700)' }}>
          No reservations yet
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mk-ink-500)' }}>
          Once customers book, they appear here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Date pager + stats ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          padding: '8px 0 12px',
          borderBottom: '1px solid var(--mk-ink-100)',
          marginBottom: 14,
        }}
      >
        {/* Left: date pager */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => setActiveDate(grouped[activeDateIndex - 1]!.date)}
            style={navBtnStyle(!canPrev)}
            title="Previous day"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ width: 14, height: 14 }}
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: 'var(--mk-ink-950)',
                whiteSpace: 'nowrap',
              }}
            >
              {isToday ? 'Today · ' : ''}
              {formatDateLabel(activeDate)}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: 'var(--mk-saffron-100)',
                color: 'var(--mk-saffron-700)',
                padding: '2px 8px',
                borderRadius: 99,
              }}
            >
              {stats.total}
            </span>
          </div>

          <button
            type="button"
            disabled={!canNext}
            onClick={() => setActiveDate(grouped[activeDateIndex + 1]!.date)}
            style={navBtnStyle(!canNext)}
            title="Next day"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ width: 14, height: 14 }}
              aria-hidden
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          {!isToday && grouped.some((g) => g.date === today) ? (
            <button
              type="button"
              onClick={() => setActiveDate(today)}
              style={{
                marginLeft: 4,
                height: 28,
                padding: '0 10px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 7,
                border: '1px solid var(--mk-ink-200)',
                background: 'white',
                color: 'var(--mk-ink-600)',
                cursor: 'pointer',
              }}
            >
              Today
            </button>
          ) : null}

          {/* Date jump mini-select */}
          {grouped.length > 3 ? (
            <div style={{ position: 'relative', marginLeft: 4 }}>
              <select
                value={activeDate}
                onChange={(e) => setActiveDate(e.target.value)}
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  height: 28,
                  padding: '0 26px 0 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  border: '1px solid var(--mk-ink-200)',
                  borderRadius: 7,
                  background: 'white',
                  color: 'var(--mk-ink-700)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {grouped.map((g) => (
                  <option key={g.date} value={g.date}>
                    {formatDateLabel(g.date)} ({g.rows.length})
                  </option>
                ))}
              </select>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{
                  width: 11,
                  height: 11,
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--mk-ink-500)',
                  pointerEvents: 'none',
                }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          ) : null}
        </div>

        {/* Right: stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <StatChip label="Bookings" value={stats.total} />
          <StatChip label="Covers" value={stats.covers} />
          <StatChip label="Seated" value={stats.seatedCount} />
          <StatChip
            label="Pending"
            value={stats.pendingCount}
            tone={stats.pendingCount > 0 ? 'warning' : undefined}
          />
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 9,
            marginBottom: 16,
            background: 'var(--mk-rose-50)',
            color: 'var(--mk-rose-700)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* ── Main split panel ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selected ? 'minmax(0, 1fr) 340px' : '1fr',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        {/* Left: timeline + guest list */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--mk-ink-100)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-xs)',
            overflow: 'hidden',
          }}
        >
          {/* Timeline */}
          <div style={{ borderBottom: '1px solid var(--mk-ink-100)' }}>
            <div
              style={{
                padding: '14px 20px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--mk-ink-700)' }}>
                  Service timeline
                </span>
                <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--mk-ink-400)' }}>
                  {formatDateLabel(activeDate, 'full')} · ordered by slot
                </span>
              </div>
            </div>
            <div style={{ padding: '0 20px 14px' }}>
              <Timeline
                reservations={activeRows}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
              />
            </div>
          </div>

          {/* Search bar */}
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--mk-ink-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--mk-ink-800)' }}>
              {displayRows.length} reservation{displayRows.length !== 1 ? 's' : ''}
              {search.trim() ? (
                <span style={{ fontWeight: 400, color: 'var(--mk-ink-400)', fontSize: 12 }}>
                  {' '}
                  matching &ldquo;{search}&rdquo;
                </span>
              ) : null}
            </div>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                style={{
                  width: 13,
                  height: 13,
                  position: 'absolute',
                  left: 9,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--mk-ink-400)',
                  pointerEvents: 'none',
                }}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search guests…"
                style={{
                  height: 32,
                  width: 200,
                  paddingLeft: 28,
                  paddingRight: 10,
                  fontSize: 12.5,
                  border: '1px solid var(--mk-ink-200)',
                  borderRadius: 8,
                  background: 'var(--mk-canvas-50)',
                  color: 'var(--mk-ink-950)',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          {/* Guest table */}
          {activeRows.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mk-ink-700)' }}>
                No reservations {isToday ? 'today' : 'on this day'}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--mk-ink-400)' }}>
                Use the arrows to browse other dates, or create a new booking.
              </div>
            </div>
          ) : displayRows.length === 0 ? (
            <div
              style={{
                padding: '32px 24px',
                textAlign: 'center',
                color: 'var(--mk-ink-400)',
                fontSize: 13,
              }}
            >
              No guests match &ldquo;{search}&rdquo;
            </div>
          ) : (
            <>
              {lunch.length > 0 && (
                <MealSection
                  label="Lunch"
                  rows={lunch}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                />
              )}
              {dinner.length > 0 && (
                <MealSection
                  label="Dinner"
                  rows={dinner}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                />
              )}
            </>
          )}
        </div>

        {/* Right: detail panel */}
        {selected ? (
          <ReservationDetail
            reservation={selected}
            canEdit={canEdit}
            pending={pending && pendingId === selected.id}
            onTransition={onTransition}
            onDelete={onDelete}
          />
        ) : null}
      </div>
    </div>
  );
}

function MealSection({
  label,
  rows,
  selectedId,
  onSelect,
}: {
  label: string;
  rows: Reservation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div
        style={{
          padding: '8px 20px 6px',
          background: 'var(--mk-canvas-50)',
          borderBottom: '1px solid var(--mk-ink-100)',
          borderTop: label === 'Dinner' ? '1px solid var(--mk-ink-100)' : undefined,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--mk-ink-400)',
          }}
        >
          {label}
        </span>
        <span
          style={{
            marginLeft: 8,
            fontSize: 10.5,
            fontWeight: 600,
            background: 'var(--mk-canvas-200)',
            color: 'var(--mk-ink-500)',
            padding: '1px 6px',
            borderRadius: 99,
          }}
        >
          {rows.length}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((r) => {
            const isSelected = r.id === selectedId;
            const tone = STATUS_TONE[r.status] ?? 'subtle';
            const ts = TONE_STYLE[tone];
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                style={{
                  cursor: 'pointer',
                  background: isSelected ? 'var(--mk-canvas-100)' : 'white',
                  transition: 'background 80ms',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLElement).style.background = 'var(--mk-canvas-50)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'white';
                }}
              >
                {/* Time */}
                <td style={{ ...td(), width: 70, paddingRight: 8 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--mk-ink-700)',
                    }}
                  >
                    {r.slotStart}
                  </span>
                </td>

                {/* Guest name + notes */}
                <td style={td()}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mk-ink-950)' }}>
                    {r.name}
                  </div>
                  {r.notes ? (
                    <div style={{ fontSize: 11, color: 'var(--mk-saffron-700)', marginTop: 1 }}>
                      ✦ {r.notes}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--mk-ink-400)', marginTop: 1 }}>
                      {r.phone ?? r.email}
                    </div>
                  )}
                </td>

                {/* Party */}
                <td style={{ ...td(), width: 52, textAlign: 'center' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      style={{ width: 12, height: 12, color: 'var(--mk-ink-400)' }}
                      aria-hidden
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mk-ink-700)' }}>
                      {r.partySize}
                    </span>
                  </div>
                </td>

                {/* Status */}
                <td style={{ ...td(), width: 110 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11.5,
                      fontWeight: 600,
                      background: ts.bg,
                      color: ts.fg,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 99,
                        background: ts.dot,
                        flexShrink: 0,
                      }}
                    />
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>

                {/* Action */}
                <td style={{ ...td(), width: 60, textAlign: 'right', paddingRight: 16 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r.id);
                    }}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--mk-saffron-700)',
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                  >
                    Details
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--mk-ink-400)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontFamily: 'var(--font-serif)',
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: tone === 'warning' && value > 0 ? 'var(--mk-saffron-700)' : 'var(--mk-ink-950)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 30,
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: '1px solid var(--mk-ink-200)',
    background: 'white',
    color: disabled ? 'var(--mk-ink-300)' : 'var(--mk-ink-700)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

function Timeline({
  reservations,
  selectedId,
  onSelect,
}: {
  reservations: Reservation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const start = Math.min(...reservations.map((r) => timeToMinutes(r.slotStart)), 12 * 60);
  const end = Math.max(...reservations.map((r) => timeToMinutes(r.slotEnd)), 22 * 60);
  const total = Math.max(120, end - start);
  const hours = Array.from(
    { length: Math.max(2, Math.ceil(total / 60) + 1) },
    (_, i) => Math.floor(start / 60) + i,
  );

  // Now line
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = nowMin >= start && nowMin <= end;
  const nowPct = ((nowMin - start) / total) * 100;

  return (
    <div style={{ position: 'relative', height: 120, overflow: 'hidden' }}>
      {/* Hour grid */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        {hours.map((hour) => (
          <div
            key={hour}
            style={{ flex: 1, borderLeft: '1px dashed var(--mk-ink-100)', position: 'relative' }}
          >
            <span
              style={{
                position: 'absolute',
                top: 0,
                left: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--mk-ink-400)',
              }}
            >
              {String(hour).padStart(2, '0')}:00
            </span>
          </div>
        ))}
      </div>

      {/* Now line */}
      {showNow ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${nowPct}%`,
            width: 2,
            background: 'var(--mk-saffron-500)',
            zIndex: 2,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -4,
              left: -5,
              width: 12,
              height: 12,
              borderRadius: 999,
              background: 'var(--mk-saffron-500)',
              border: '2px solid white',
            }}
          />
        </div>
      ) : null}

      {/* Booking blocks */}
      {reservations.map((r, i) => {
        const rStart = timeToMinutes(r.slotStart);
        const rEnd = timeToMinutes(r.slotEnd);
        const left = Math.max(0, ((rStart - start) / total) * 100);
        const width = Math.max(5, ((rEnd - rStart) / total) * 100);
        const lane = i % 4;
        const tone = STATUS_TONE[r.status] ?? 'subtle';
        const ts = TONE_STYLE[tone];
        const isSelected = r.id === selectedId;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r.id)}
            title={`${r.name} · ${r.slotStart}–${r.slotEnd} · ${r.partySize}p`}
            style={{
              position: 'absolute',
              left: `calc(${left}% + 4px)`,
              top: 18 + lane * 24,
              width: `calc(${width}% - 6px)`,
              minWidth: 80,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 7px',
              borderRadius: 5,
              border: `1px solid ${isSelected ? 'var(--mk-ink-950)' : ts.dot}`,
              borderLeft: `3px solid ${ts.dot}`,
              background: isSelected ? ts.bg : `color-mix(in oklab, ${ts.dot} 12%, white)`,
              color: 'var(--mk-ink-950)',
              boxShadow: isSelected ? '0 0 0 2px var(--mk-saffron-200)' : 'none',
              fontSize: 10.5,
              fontWeight: 600,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              zIndex: 1,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
            <span style={{ color: 'var(--mk-ink-500)', flexShrink: 0 }}>· {r.partySize}p</span>
          </button>
        );
      })}
    </div>
  );
}

function ReservationDetail({
  reservation,
  canEdit,
  pending,
  onTransition,
  onDelete,
}: {
  reservation: Reservation;
  canEdit: boolean;
  pending: boolean;
  onTransition: (id: string, status: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const actions = canEdit ? (NEXT_ACTIONS[reservation.status] ?? []) : [];
  const tone = STATUS_TONE[reservation.status] ?? 'subtle';
  const ts = TONE_STYLE[tone];

  return (
    <aside
      style={{
        position: 'sticky',
        top: 76,
        background: 'white',
        border: '1px solid var(--mk-ink-100)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-xs)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--mk-ink-100)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: ts.bg,
              color: ts.fg,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 99, background: ts.dot }} />
            {STATUS_LABELS[reservation.status] ?? reservation.status}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mk-ink-400)' }}
            >
              {reservation.id.slice(-7)}
            </span>
            {canEdit ? (
              <button
                type="button"
                onClick={() => onDelete(reservation.id, reservation.name)}
                disabled={pending}
                title="Delete reservation"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  border: '1px solid var(--mk-rose-200)',
                  background: 'var(--mk-rose-50)',
                  color: 'var(--mk-rose-600)',
                  cursor: pending ? 'not-allowed' : 'pointer',
                  opacity: pending ? 0.5 : 1,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 12, height: 12 }}
                  aria-hidden
                >
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: 'var(--mk-ink-950)',
            lineHeight: 1.2,
          }}
        >
          {reservation.name}
        </h3>

        <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--mk-ink-500)' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{reservation.slotStart}</span>
          {' – '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>{reservation.slotEnd}</span>
          {' · '}
          {reservation.partySize} guest{reservation.partySize === 1 ? '' : 's'}
        </div>

        {reservation.notes ? (
          <div
            style={{
              marginTop: 10,
              padding: '9px 12px',
              borderRadius: 8,
              background: 'var(--mk-saffron-50)',
              border: '1px solid var(--mk-saffron-100)',
              fontSize: 12,
              color: 'var(--mk-saffron-800)',
              lineHeight: 1.5,
            }}
          >
            {reservation.notes}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      {actions.length > 0 ? (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--mk-ink-100)',
            display: 'flex',
            gap: 6,
          }}
        >
          {actions.map((action) => (
            <button
              key={action.status}
              type="button"
              onClick={() => onTransition(reservation.id, action.status)}
              disabled={pending}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 32,
                padding: '0 12px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: pending ? 'not-allowed' : 'pointer',
                opacity: pending ? 0.6 : 1,
                flex: action.primary ? 1 : undefined,
                background: action.primary ? 'var(--mk-ink-950)' : 'white',
                color: action.primary
                  ? 'var(--mk-canvas-50)'
                  : action.danger
                    ? 'var(--mk-rose-700)'
                    : 'var(--mk-ink-700)',
                border: action.primary
                  ? '1px solid var(--mk-ink-950)'
                  : action.danger
                    ? '1px solid var(--mk-rose-200)'
                    : '1px solid var(--mk-ink-200)',
              }}
            >
              {pending ? '…' : action.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Detail rows */}
      <div style={{ padding: '10px 18px 18px' }}>
        <DetailRow label="Date" value={formatDateLabel(reservation.date, 'full')} />
        <DetailRow label="Email" value={reservation.email} mono />
        <DetailRow label="Phone" value={reservation.phone ?? 'Not provided'} mono />
        <DetailRow
          label="Source"
          value={reservation.autoConfirmed ? 'Auto-confirmed' : 'Manual approval'}
        />
        <DetailRow
          label="Created"
          value={new Date(reservation.createdAt).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        />
      </div>
    </aside>
  );
}

function td(): React.CSSProperties {
  return {
    padding: '10px 12px',
    fontSize: 13,
    color: 'var(--mk-ink-900)',
    borderBottom: '1px solid var(--mk-ink-100)',
    verticalAlign: 'middle',
  };
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 0',
        borderBottom: '1px solid var(--mk-ink-100)',
        fontSize: 12.5,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--mk-ink-400)',
          flexShrink: 0,
          paddingTop: 2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          textAlign: 'right',
          color: 'var(--mk-ink-700)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          fontSize: mono ? 11.5 : 12.5,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  );
}
