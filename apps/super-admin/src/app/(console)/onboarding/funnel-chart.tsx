'use client';

interface FunnelStep {
  step: string;
  count: number;
}

interface Props {
  steps: FunnelStep[];
  total: number;
}

const STEP_LABELS: Record<string, string> = {
  menu: 'Menu Setup',
  tables: 'Tables Setup',
  razorpay: 'Payment Gateway',
  'go-live': 'Go Live',
  complete: 'Complete',
};

export function FunnelChart({ steps, total }: Props) {
  if (total === 0) {
    return <p className="text-muted-foreground text-sm">No signups yet.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Signup bar (always 100%) */}
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm font-medium">Signed Up</span>
          <span className="text-muted-foreground text-xs tabular-nums">{total}</span>
        </div>
        <div className="bg-muted h-6 w-full rounded">
          <div className="bg-primary h-6 rounded" style={{ width: '100%' }} />
        </div>
      </div>

      {steps.map((s, i) => {
        const pct = total > 0 ? (s.count / total) * 100 : 0;
        const prevCount = i === 0 ? total : steps[i - 1]!.count;
        const dropoff = prevCount - s.count;
        const dropoffPct = prevCount > 0 ? (dropoff / prevCount) * 100 : 0;

        return (
          <div key={s.step}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm font-medium">{STEP_LABELS[s.step] ?? s.step}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {s.count} ({pct.toFixed(1)}%)
                {dropoff > 0 && (
                  <span className="ml-2 text-red-500">
                    -{dropoff} ({dropoffPct.toFixed(0)}% drop)
                  </span>
                )}
              </span>
            </div>
            <div className="bg-muted h-6 w-full rounded">
              <div
                className="bg-primary h-6 rounded transition-all"
                style={{ width: `${Math.max(pct, 0.5)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
