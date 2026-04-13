'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toggleGlobalFlagAction } from '@/app/actions/flags';
import { cn } from '@menukaze/ui';

interface FlagRow {
  key: string;
  label: string;
  description: string;
  globallyEnabled: boolean;
  overrideCount: number;
  planGateCount: number;
}

export function FlagsList({ rows }: { rows: FlagRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(key: string, currentValue: boolean) {
    setBusy(key);
    await toggleGlobalFlagAction(key, !currentValue);
    router.refresh();
    setBusy(null);
  }

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border bg-muted/50 border-b text-left">
            <th className="px-4 py-3 font-medium">Key</th>
            <th className="px-4 py-3 font-medium">Label</th>
            <th className="px-4 py-3 font-medium">Global</th>
            <th className="px-4 py-3 text-right font-medium">Overrides</th>
            <th className="px-4 py-3 text-right font-medium">Plan Gates</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-muted-foreground px-4 py-8 text-center">
                No feature flags yet.
              </td>
            </tr>
          ) : (
            rows.map((f) => (
              <tr key={f.key} className="border-border hover:bg-muted/30 border-b last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{f.key}</td>
                <td className="px-4 py-3">{f.label}</td>
                <td className="px-4 py-3">
                  <button
                    disabled={busy === f.key}
                    onClick={() => toggle(f.key, f.globallyEnabled)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
                      f.globallyEnabled ? 'bg-primary' : 'bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                        f.globallyEnabled ? 'translate-x-4' : 'translate-x-0',
                      )}
                    />
                  </button>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{f.overrideCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">{f.planGateCount}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/flags/${f.key}`}
                    className="text-muted-foreground text-xs hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
