'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface AnalyticsFilterOption {
  id: string;
  label: string;
}

interface AnalyticsFiltersProps {
  days: number;
  channel: string;
  rangeOptions: Array<{ days: number; label: string }>;
  channelOptions: AnalyticsFilterOption[];
}

export function AnalyticsFilters({
  days,
  channel,
  rangeOptions,
  channelOptions,
}: AnalyticsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = (updates: { days?: number; channel?: string }) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('export');
    if (updates.days !== undefined) next.set('days', String(updates.days));
    if (updates.channel !== undefined) next.set('channel', updates.channel);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div
        style={{
          display: 'inline-flex',
          gap: 2,
          padding: 3,
          background: 'var(--mk-canvas-100)',
          borderRadius: 10,
        }}
      >
        {rangeOptions.map((opt) => (
          <button
            key={opt.days}
            type="button"
            onClick={() => updateFilter({ days: opt.days })}
            style={{
              height: 30,
              padding: '0 14px',
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 500,
              background: days === opt.days ? 'white' : 'transparent',
              color: days === opt.days ? 'var(--mk-ink-950)' : 'var(--mk-ink-500)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: days === opt.days ? 'var(--shadow-xs)' : 'none',
              transition: 'all 150ms',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <select
        name="channel"
        value={channel}
        onChange={(event) => updateFilter({ channel: event.currentTarget.value })}
        style={{
          height: 36,
          padding: '0 12px',
          borderRadius: 9,
          fontSize: 13,
          fontWeight: 500,
          border: '1px solid var(--mk-ink-200)',
          background: 'white',
          color: 'var(--mk-ink-700)',
          cursor: 'pointer',
        }}
      >
        {channelOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
